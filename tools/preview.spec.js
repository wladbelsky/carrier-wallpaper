// Renders the Workshop preview (preview.gif, animated 256x256 вЂ” Wallpaper Engine's limits: в‰¤ 256 px, < 1 MB, ideally
// < 500 KB) and the README screenshot (screenshot.jpg, 1280x720): an afternoon fight with a dogfight pass on screen.
// Run in Docker:
//   powershell -ExecutionPolicy Bypass -File tools/test.ps1 -c tools/preview.config.js            (both)
//   powershell -ExecutionPolicy Bypass -File tools/test.ps1 -c tools/preview.config.js -g gif     (only the GIFs)
// Candidates for seeds 1..N go to test-results/gif-<seed>.gif (+ gif-<seed>-sheet.png, a few frames to look at) and
// test-results/screenshot-<seed>.jpg; copy the best ones over preview.gif / screenshot.jpg. Every run clears test-results/.
const fs = require('fs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const { test, expect } = require('../tests/support/harness');

test.setTimeout(5 * 60 * 1000);

const SEEDS = 6;
const GIF = { size: 256, render: 1024, zoom: 180, frames: 40, fps: 10, colors: 96 };

/* boot, let flights get up and missions go, then start the music: combat */
async function toFight(wp, seed, query, before) {
  await wp.boot({ seed, query });
  if (before) await wp.run(before);
  await wp.sim(150);                                   // flights up, the tanker and missions out and back
  await wp.sim(6, { audio: true });                    // the music starts: combat
  await wp.run(() => { STRESS.level = 0.45; });
}

/* fight until pred(tries) is true in the page */
async function fightUntil(wp, pred, tries = 400) {
  for (let i = 0; i < tries; i++) {
    await wp.sim(0.5, { audio: true, check: false });
    if (await wp.run(pred, i)) return true;
  }
  return false;
}

test.describe('screenshot', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  for (let seed = 1; seed <= SEEDS; seed++) {
    test(`screenshot, seed ${seed}`, async ({ wp, page }) => {
      await toFight(wp, seed, '?hour=15.5');
      // a dogfight pass well inside the screen with a subtitle up (an enemy one if it comes within ~100 s)
      const ok = await fightUntil(wp, (tries) => {
        const inside = p => AIRWAR.onScreen(p, -0.35);
        const pass = AIRWAR.passes.find(p => !p.heli && p.bandit && enemyAlive(p.bandit) && inside(p.bandit.p) && p.crew.some(a => a.state === 'cbt_pass' && inside(a.mesh.position)));
        return !!pass && document.getElementById('subs').classList.contains('on') && (RADIO.cur.role === 'enemy' || tries > 200);
      });
      expect(ok, 'a dogfight on screen with a subtitle').toBe(true);
      await wp.run(() => __t.render());
      await page.screenshot({ path: `test-results/screenshot-${seed}.jpg`, type: 'jpeg', quality: 90 });
    });
  }
});

test.describe('gif', () => {
  test.use({ viewport: { width: GIF.render, height: GIF.render } });
  for (let seed = 1; seed <= SEEDS; seed++) {
    test(`gif, seed ${seed}`, async ({ wp }) => {
      // only the scene: the panel and subtitles are unreadable at 256 px
      await toFight(wp, seed, `?hour=15.5&zoom=${GIF.zoom}`, () => { CFG.showPanel = false; CFG.subtitles = false; applySettings(); });
      // a dogfight pass coming onto the screen
      const ok = await fightUntil(wp, () => AIRWAR.passes.some(p => !p.heli && p.bandit && enemyAlive(p.bandit) &&
        AIRWAR.onScreen(p.bandit.p, 0) && p.crew.some(a => a.state === 'cbt_pass' && AIRWAR.onScreen(a.mesh.position, 0))));
      expect(ok, 'a dogfight pass on screen').toBe(true);

      const frames = [];
      for (let i = 0; i < GIF.frames; i++) {
        await wp.sim(1 / GIF.fps, { audio: true, check: false });
        const b64 = await wp.run(([size, i, n]) => {
          __t.render();
          // downscale in halving steps (smooth, no aliasing) вЂ” in the same task as the render, so the WebGL buffer is still there
          const C = window.__gifC || (window.__gifC = {});
          let src = renderer.domElement, w = src.width;
          while (w > size) {
            w = Math.max(size, w >> 1);
            const c = C[w] || (C[w] = Object.assign(document.createElement('canvas'), { width: w, height: w }));
            const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, w); src = c;
          }
          // a contact sheet of four frames, to look at the candidates without a GIF viewer
          const sheet = C.sheet || (C.sheet = Object.assign(document.createElement('canvas'), { width: size * 2, height: size * 2 }));
          const k = [0, n / 3, 2 * n / 3, n - 1].map(Math.floor).indexOf(i);
          if (k >= 0) sheet.getContext('2d').drawImage(src, (k % 2) * size, (k >> 1) * size);
          const d = src.getContext('2d').getImageData(0, 0, size, size).data;
          let s = ''; for (let j = 0; j < d.length; j += 0x8000) s += String.fromCharCode.apply(null, d.subarray(j, j + 0x8000));
          return btoa(s);
        }, [GIF.size, i, GIF.frames]);
        frames.push(new Uint8Array(Buffer.from(b64, 'base64')));
      }
      const sheet = await wp.run(() => __gifC.sheet.toDataURL('image/png').split(',')[1]);
      fs.writeFileSync(`test-results/gif-${seed}-sheet.png`, Buffer.from(sheet, 'base64'));

      // one palette for all frames (no flicker between frames), from every other frame
      const all = new Uint8Array(frames[0].length * Math.ceil(frames.length / 2));
      frames.filter((f, i) => i % 2 === 0).forEach((f, i) => all.set(f, i * f.length));
      const palette = quantize(all, GIF.colors);
      const gif = GIFEncoder();
      frames.forEach((f, i) => gif.writeFrame(applyPalette(f, palette), GIF.size, GIF.size,
        i ? { delay: 1000 / GIF.fps } : { palette, delay: 1000 / GIF.fps, repeat: 0 }));
      gif.finish();
      const bytes = gif.bytes();
      fs.writeFileSync(`test-results/gif-${seed}.gif`, bytes);
      console.log(`gif-${seed}.gif: ${(bytes.length / 1024).toFixed(0)} KB`);
      expect(bytes.length, 'Wallpaper Engine takes previews under 1 MB').toBeLessThan(1024 * 1024);
    });
  }
});
