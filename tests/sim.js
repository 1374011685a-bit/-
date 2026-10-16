/**
 * Headless verification for Block Jump's core.
 *
 * Loads the pure logic files into a VM sandbox (no browser needed) and checks:
 *   1. tuning/range sanity
 *   2. every generated jump has a solution
 *   3. a bot driving the *real* player physics survives long runs
 *      (this is the test that catches solver/physics drift)
 *   4. difficulty actually ramps
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../js");

function load() {
  const sandbox = { console, Math, globalThis: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ["config.js", "world.js", "player.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  }
  return sandbox.BJ;
}

const BJ = load();
const M = BJ.Motion;
const C = BJ.CONFIG;

let failures = 0;
function check(name, cond, detail) {
  if (!cond) {
    failures++;
    console.log(`FAIL  ${name}${detail ? " :: " + detail : ""}`);
  } else {
    console.log(`ok    ${name}${detail ? " :: " + detail : ""}`);
  }
}

console.log("--- 1. tuning ---");
const minRange = M.flatRange(0), maxRange = M.flatRange(1);
console.log(`  flat range: ${minRange.toFixed(1)}px (tap) .. ${maxRange.toFixed(1)}px (full charge)`);
console.log(`  peak height: ${M.peakFor(0).toFixed(1)}px .. ${M.peakFor(1).toFixed(1)}px`);
console.log(`  charge window quantisation: 1/45 = ${(1 / 45).toFixed(4)}`);
check("tap jump clears the smallest gap", minRange > C.world.gapMinEasy, `${minRange.toFixed(1)} > ${C.world.gapMinEasy}`);
check(
  "full charge clears the biggest generated gap",
  maxRange > C.world.gapMaxHard + 8,
  `${maxRange.toFixed(1)} > ${C.world.gapMaxHard} + 8`
);
check("plain-jump window is at least 2 charge frames", C.world.windowPlainMin >= 2 / 45);
{
  /* the level is validated from the worst standing spot, so a wide platform
     must be paired with a shorter gap: check the envelope is respected */
  let worst = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const world = BJ.World.create(seed);
    world.ensure(120);
    world.plats.forEach((pl, i) => {
      if (i === 0) return;
      const prev = world.plats[i - 1];
      worst = Math.max(worst, pl.gap + (prev.w - 8) - maxRange);
    });
  }
  check("no gap needs more than a full charge from the worst standing spot", worst <= 0, `worst overreach ${worst.toFixed(1)}px`);
}

console.log("\n--- 2. generation is always solvable ---");
{
  let plats = 0, unsolved = 0, minWindow = 1, minUsable = 99, maxGap = 0, widths = new Set(), hazards = 0, movers = 0, crumbles = 0;
  let offsets = 0, offsetUnsolved = 0, minOffsetWindow = 1;
  const seeds = 40;
  for (let seed = 1; seed <= seeds; seed++) {
    const world = BJ.World.create(seed);
    world.ensure(150);
    for (let i = 1; i < world.plats.length; i++) {
      const prev = world.plats[i - 1], pl = world.plats[i];
      /* the guarantee: solvable from the far left of the previous platform */
      const solved = BJ.World.Jump.solve(prev, pl, {
        time: 0.37,
        hazards: pl.hazards,
        needTime: 0.28,
        samples: 160,
        fromOffset: 8
      });
      plats++;
      if (!solved.feasible) unsolved++;
      else {
        minWindow = Math.min(minWindow, solved.window);
        if (pl.type === "mover") minUsable = Math.min(minUsable, solved.usable);
      }

      /* ... and from every other spot it could have landed on. Sample twice
         as finely as the generator does, so a dip between its samples shows
         up here rather than in someone's run. */
      for (const off of BJ.World.Jump.offsets(prev, 2)) {
        const s2 = BJ.World.Jump.solve(prev, pl, { time: 0.37, hazards: pl.hazards, samples: 120, fromOffset: off });
        offsets++;
        if (!s2.feasible) offsetUnsolved++;
        else minOffsetWindow = Math.min(minOffsetWindow, s2.window);
      }
      maxGap = Math.max(maxGap, pl.gap);
      widths.add(pl.w);
      hazards += pl.hazards.length;
      if (pl.type === "mover") movers++;
      if (pl.type === "crumble") crumbles++;
    }
  }
  console.log(
    `  ${seeds} seeds x 150 platforms: ${plats} jumps, ${hazards} hazards, ${movers} movers, ${crumbles} crumbles`
  );
  console.log(
    `  widest gap ${maxGap.toFixed(1)}px, widths ${[...widths].sort((a, b) => a - b).join(",")}, min window ${minWindow.toFixed(
      3
    )}, min mover catch-time ${minUsable.toFixed(3)}s`
  );
  check("no unsolvable jump", unsolved === 0, `${unsolved} of ${plats}`);
  check("every jump keeps a fair charge window", minWindow >= 0.04, `min ${minWindow.toFixed(3)}`);
  /* The generator aims for 0.2s of catch time; re-solving on a different
     phase grid can read up to a grid step lower. */
  check("moving platforms are catchable for long enough", minUsable >= 0.15, `min ${minUsable.toFixed(3)}s`);
  check(
    "solvable from every standing position on the previous platform",
    offsetUnsolved === 0,
    `${offsetUnsolved} of ${offsets} offsets unsolvable, thinnest window ${minOffsetWindow.toFixed(3)}`
  );
  check("gaps stay inside the reachable range", maxGap <= maxRange - 8, `${maxGap.toFixed(1)} <= ${(maxRange - 8).toFixed(1)}`);
  check("platform widths stay in bounds", [...widths].every((v) => v >= 32 && v <= 96));
}

console.log("\n--- 3. difficulty ramps ---");
{
  const avg = (list) => list.reduce((a, b) => a + b, 0) / (list.length || 1);
  const early = [], mid = [], late = [];
  for (let seed = 1; seed <= 20; seed++) {
    const world = BJ.World.create(seed);
    world.ensure(160);
    world.plats.forEach((pl, i) => {
      if (i === 0) return;
      if (i >= 1 && i <= 8) early.push(pl.gap);
      if (i >= 40 && i <= 48) mid.push(pl.gap);
      if (i >= 90 && i <= 98) late.push(pl.gap);
    });
  }
  const e = avg(early), m = avg(mid), l = avg(late);
  console.log(`  avg gap: start ${e.toFixed(1)}px, mid ${m.toFixed(1)}px, late ${l.toFixed(1)}px`);
  check("gaps grow with distance", e < m && m < l);
  check("first jumps are gentle", e < 60, `${e.toFixed(1)}`);
}

console.log("\n--- 4. bot plays the real physics ---");
{
  const dt = C.step;
  let totalPlats = 0, deaths = 0, stars = 0, starTotal = 0, perfects = 0, shieldSaves = 0, runs = 0;
  let maxJumpLanded = 0;
  let selfMoved = 0, offEdge = 0, maxLandOffset = 0;

  for (let seed = 1; seed <= 10; seed++) {
    runs++;
    const world = BJ.World.create(seed);
    world.ensure(2);
    const p = BJ.Player.create({ plat: world.plats[0] });
    const cb = {
      onDeath: () => {},
      onPerfect: () => perfects++,
      onShieldSave: () => shieldSaves++
    };
    let dead = false;
    let guard = 0;
    const targetPlat = 220;
    let plan = null;

    while (!dead && p.plat.i < targetPlat && guard++ < 220 * 60 * 6) {
      world.ensure(p.plat.i + 3);
      const input = { held: false, pressed: false, released: false };

      /* Same bot that plays the title screen; the plan is made before the
         world ticks, so the take-off happens one step from now. */
      input.held = BJ.Player.botInput(p, world, { time: world.time + dt });

      const before = p.plat;
      const groundedX = p.state === "idle" ? p.x : null;
      world.update(dt, p);
      BJ.Player.update(p, dt, world, input, cb);
      /* the block must never move by itself once it is standing still */
      if (groundedX !== null && p.state === "idle" && p.plat && p.plat.type !== "mover" && Math.abs(p.x - groundedX) > 1e-6) {
        selfMoved++;
      }
      if (p.state !== "air" && p.plat && (p.offset < 8 - 1e-6 || p.offset > p.plat.w - 8 + 1e-6)) offEdge++;
      if (p.state === "idle" || p.state === "charge") maxLandOffset = Math.max(maxLandOffset, p.plat ? p.plat.w - 8 - p.offset : 0);
      if (p.state === "dead") dead = true;
      if (p.plat !== before && p.state !== "air") {
        totalPlats++;
        maxJumpLanded = Math.max(maxJumpLanded, p.bestX);
        world.prune(p.x - 240);
      }
    }

    if (dead) {
      deaths++;
      console.log(`  seed ${seed}: died on platform ${p.plat.i} (state ${p.state}), blocks ${p.blocks()}`);
    }
    stars += p.stars;
    starTotal += targetPlat; // for the report only
  }

  console.log(`  ${runs} runs, ${totalPlats} landings, ${stars} stars, ${perfects} perfect landings, ${shieldSaves} shield saves`);
  console.log(`  standing still: ${selfMoved} self-moves, ${offEdge} frames hanging off an edge, deepest landing ${maxLandOffset.toFixed(0)}px short of the ledge`);
  check("bot never dies", deaths === 0, `${deaths} deaths`);
  check("bot clears the target distance", totalPlats >= runs * 200, `${totalPlats} / ${runs * 200}`);
  check("stars are collectable", stars > runs * 40, `${stars} stars`);
  check("block never slides on its own after landing", selfMoved === 0, `${selfMoved} self-moves`);
  check("block never hangs off a platform edge", offEdge === 0, `${offEdge} frames`);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
