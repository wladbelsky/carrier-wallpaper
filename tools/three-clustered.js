// ClusteredLighting for orthographic cameras too (bundled into js/three.min.js by tools/three-entry.js).
// r187's ClusteredLightsNode builds the cluster bounds for a perspective camera only: a tile's view-space x / y grow with
// depth. The wallpaper's isometric camera is orthographic (x / y do not depend on depth, and the view may be off-centre),
// so lights landed in the wrong clusters. This subclass replaces _create() — a copy of r187's with the bounds for both
// camera kinds (the lines marked ORTHO) — and passes the camera kind in updateBefore(). Re-check it against
// three/examples/jsm/tsl/lighting/ClusteredLightsNode.js whenever three.js is updated.
import { ClusteredLighting as AddonClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import AddonClusteredLightsNode from 'three/addons/tsl/lighting/ClusteredLightsNode.js';
import {
	instancedArray, int, float, vec3, ivec2, ivec4, uniform, Break, Loop, positionView, Fn, If, textureLoad, instanceIndex,
	screenCoordinate, renderGroup, min, max, pow, log, clamp, dot, mix
} from 'three/tsl';

class ClusteredLightsNode extends AddonClusteredLightsNode {

	constructor( ...args ) {

		super( ...args );
		this._cameraOrtho = uniform( 0 ).setName( 'clusteredCameraOrtho' ).setGroup( renderGroup );   // ORTHO: 1 = orthographic

	}

	updateBefore( frame ) {

		this._cameraOrtho.value = frame.camera.isOrthographicCamera === true ? 1 : 0;   // ORTHO
		super.updateBefore( frame );

	}

	// never an empty grid (a 0 × 0 canvas, e.g. a hidden page): a zero-sized storage buffer is a validation error
	_resize( width, height ) {

		super._resize( Math.max( width, this.tileSize ), Math.max( height, this.tileSize ) );

	}

	_create( clusterCount ) {

		const { tileSize, zSlices, _chunksPerCluster: chunksPerCluster } = this;
		const NZ = zSlices;
		const grid = this._gridDimensions;
		const NX = int( grid.x );
		const NY = int( grid.y );

		const requiredElements = clusterCount * chunksPerCluster;
		const previousElements = this._lightIndexes !== null ? this._lightIndexes.value.array.length / 4 : 0;
		const elements = previousElements === 0 ? Math.ceil( requiredElements * 1.5 ) : Math.max( requiredElements, previousElements * 2 );

		if ( this._compute !== null ) {

			this.needsUpdate = true;
			this._compute.dispose();
			this._lightIndexes.value.dispose();

		}

		const lightIndexes = instancedArray( new Int32Array( elements * 4 ), 'ivec4' ).setPBO( true ).setName( 'lightIndexes' );

		// view-space AABB of the given cluster
		const getClusterBounds = ( clusterIndex ) => {

			const P = this._cameraProjectionMatrix, ortho = this._cameraOrtho;
			const invFocalX = float( 1 ).div( P.element( 0 ).element( 0 ) );
			const invFocalY = float( 1 ).div( P.element( 1 ).element( 1 ) );

			const cx = clusterIndex.mod( NX );
			const cy = clusterIndex.div( NX ).mod( NY );
			const cz = clusterIndex.div( NX.mul( NY ) );

			// ORTHO: view x = ( ndc x − P[3][0] ) / P[0][0] at any depth; perspective: view x = ndc x · ( −view z ) / P[0][0]
			const offX = P.element( 3 ).element( 0 ).mul( ortho );
			const offY = P.element( 3 ).element( 1 ).mul( ortho );
			const ndcXmin = float( cx ).mul( 2.0 ).div( grid.x ).sub( 1.0 ).sub( offX );
			const ndcXmax = float( cx.add( int( 1 ) ) ).mul( 2.0 ).div( grid.x ).sub( 1.0 ).sub( offX );
			const ndcYmax = float( 1 ).sub( float( cy ).mul( 2.0 ).div( grid.y ) ).sub( offY );
			const ndcYmin = float( 1 ).sub( float( cy.add( int( 1 ) ) ).mul( 2.0 ).div( grid.y ) ).sub( offY );

			const farOverNear = this._cameraFar.div( this._cameraNear );
			const zNearCluster = this._cameraNear.mul( pow( farOverNear, float( cz ).mul( 1.0 / NZ ) ) ).negate();
			const zFarCluster = this._cameraNear.mul( pow( farOverNear, float( cz.add( int( 1 ) ) ).mul( 1.0 / NZ ) ) ).negate();

			const depthNear = mix( zNearCluster.negate(), float( 1 ), ortho );   // ORTHO
			const depthFar = mix( zFarCluster.negate(), float( 1 ), ortho );     // ORTHO
			const scaleNearX = depthNear.mul( invFocalX );
			const scaleFarX = depthFar.mul( invFocalX );
			const scaleNearY = depthNear.mul( invFocalY );
			const scaleFarY = depthFar.mul( invFocalY );

			const xMinNear = ndcXmin.mul( scaleNearX );
			const xMaxNear = ndcXmax.mul( scaleNearX );
			const xMinFar = ndcXmin.mul( scaleFarX );
			const xMaxFar = ndcXmax.mul( scaleFarX );
			const yMinNear = ndcYmin.mul( scaleNearY );
			const yMaxNear = ndcYmax.mul( scaleNearY );
			const yMinFar = ndcYmin.mul( scaleFarY );
			const yMaxFar = ndcYmax.mul( scaleFarY );

			const aabbMin = vec3( min( xMinNear, xMinFar ), min( yMinNear, yMinFar ), zFarCluster );
			const aabbMax = vec3( max( xMaxNear, xMaxFar ), max( yMaxNear, yMaxFar ), zNearCluster );

			return { cz, aabbMin, aabbMax };

		};

		// sphere-AABB intersection in view space
		const intersectsCluster = ( lightIdx, aabbMin, aabbMax ) => {

			const { center, radius } = this._getLightBounds( lightIdx );
			const closest = max( aabbMin, min( center, aabbMax ) );
			const diff = center.sub( closest );
			const distSq = dot( diff, diff );
			return radius.lessThan( 0 ).or( distSq.lessThanEqual( radius.mul( radius ) ) );

		};

		const chunksPerInvocation = this._isWebGLBackend ? 1 : chunksPerCluster;
		const invocationsPerCluster = chunksPerCluster / chunksPerInvocation;
		this._invocationsPerCluster = invocationsPerCluster;

		const compute = Fn( () => {

			const clusterIndex = int( instanceIndex.div( invocationsPerCluster ) );
			const firstChunk = int( instanceIndex.mod( invocationsPerCluster ) ).mul( chunksPerInvocation );
			const firstSlot = firstChunk.mul( 4 );
			const lastSlot = firstSlot.add( chunksPerInvocation * 4 );

			const { cz, aabbMin, aabbMax } = getClusterBounds( clusterIndex );

			const chunks = ivec4( 0 ).toArray( chunksPerInvocation ).toVar();
			const index = int( 0 ).toVar();

			const zRange = textureLoad( this._zSliceRangesTexture, ivec2( cz, 0 ) );
			const rangeStart = int( zRange.x );
			const rangeEnd = int( zRange.y );

			Loop( this.maxLights, ( { i } ) => {

				const lightIdx = rangeStart.add( i );
				If( index.greaterThanEqual( lastSlot ).or( lightIdx.greaterThanEqual( rangeEnd ) ), () => {

					Break();

				} );
				If( intersectsCluster( lightIdx, aabbMin, aabbMax ), () => {

					If( index.greaterThanEqual( firstSlot ), () => {

						const slot = index.sub( firstSlot );
						chunks.element( slot.div( 4 ) ).element( slot.mod( 4 ) ).assign( lightIdx.add( int( 1 ) ) );

					} );
					index.addAssign( int( 1 ) );

				} );

			} );

			const firstElement = clusterIndex.mul( chunksPerCluster ).add( firstChunk );
			const writeChunks = () => {

				Loop( chunksPerInvocation, ( { i } ) => {

					lightIndexes.element( firstElement.add( i ) ).assign( chunks.element( i ) );

				} );

			};

			if ( this._isWebGLBackend === true ) {

				If( firstElement.lessThan( int( elements ) ).and( int( this.id ).notEqual( int( - 1 ) ) ), writeChunks );

			} else {

				writeChunks();

			}

		} )().compute( clusterCount * invocationsPerCluster ).setName( 'Update Clustered Lights' );

		// shading-side: fragment → cluster index
		const getScreenClusterIndex = Fn( () => {

			const screenTile = screenCoordinate.div( tileSize ).floor();
			const viewDepth = positionView.z.negate();
			const invLogFarOverNear = float( 1 ).div( log( this._cameraFar.div( this._cameraNear ) ) );
			const sliceFloat = log( viewDepth.div( this._cameraNear ) ).mul( invLogFarOverNear ).mul( float( NZ ) );
			const zSlice = clamp( sliceFloat.floor(), float( 0 ), float( NZ - 1 ) );
			return int( screenTile.x ).add( int( screenTile.y ).mul( NX ) ).add( int( zSlice ).mul( NX.mul( NY ) ) );

		} );

		this._lightIndexes = lightIndexes;
		this._screenClusterIndex = getScreenClusterIndex().toVar();
		this._compute = compute;
		this._needsRebuild = false;

	}

}

export class ClusteredLighting extends AddonClusteredLighting {

	createNode( lights = [] ) {

		return new ClusteredLightsNode( this.maxLights, this.tileSize, this.zSlices, this.maxLightsPerCluster ).setLights( lights );

	}

}
