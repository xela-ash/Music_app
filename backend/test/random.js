// Seeded pseudo-random generator for property tests. A fixed seed makes every
// generated case reproducible; a failing assertion reports the seed.
function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1));
  }
  function pick(items) {
    return items[int(0, items.length - 1)];
  }
  function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  return { next, int, pick, shuffle };
}

module.exports = { createRandom };
