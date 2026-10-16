/** Per-platform generation cost, to make sure the game never hitches. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "../js");
const sandbox = { console, Math };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["config.js", "world.js", "player.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
}
const BJ = sandbox.BJ;

let all = [];
for (let seed = 1; seed <= 25; seed++) {
  const world = BJ.World.create(seed);
  world.ensure(1);
  const t0 = performance.now();
  world.ensure(200);
  const dt = performance.now() - t0;
  all.push(dt / 199);
}
all.sort((a, b) => a - b);
console.log(
  `generation ms/platform: median ${all[12].toFixed(2)}, p90 ${all[22].toFixed(2)}, worst ${all[all.length - 1].toFixed(2)}`
);

/* Worst case: a fresh solve of the current jump at 60Hz, for the aim aid. */
const world = BJ.World.create(7);
world.ensure(120);
const p = BJ.Player.create({ plat: world.at(110) });
const t1 = performance.now();
const N = 3000;
for (let i = 0; i < N; i++) world.planJump(world.at(110 + (i % 5)), { mul: 1, samples: 160, atTime: world.time + i * 0.001 });
console.log(`solver: ${((performance.now() - t1) / N).toFixed(3)} ms per call (160 charge samples)`);
