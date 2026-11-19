// Entry for the vendored three.js bundle (tools/build_three.sh → js/three.min.js): three with WebGPURenderer and the
// node materials as one global THREE, TSL as THREE.TSL, plus the add-ons the wallpaper uses
export * from 'three/webgpu';
export * as TSL from 'three/tsl';
export { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
export { bloom } from 'three/addons/tsl/display/BloomNode.js';
