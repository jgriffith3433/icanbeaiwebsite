// The Pressure meter and the helpers powers.js exports, without a browser.
//
//   node scripts/check-powers.mjs
//
import {
  POWER_NAMES,
  createGauge,
  cameraForward,
  inCone,
  thunderDelay,
  nearestStructure,
  streetCourse,
} from "../js/powers.js";

const problems = [];
const ok = (cond, msg) => {
  if (!cond) problems.push(msg);
  return cond;
};

ok(POWER_NAMES.join(",") === "storm,bolt,gust,tornado", `power names are ${POWER_NAMES.join(",")}`);

const g = createGauge({ max: 100, regen: 10, stormRegen: 20, costs: { storm: 40, bolt: 24, gust: 16, tornado: 48 }, start: 0 });
ok(g.now().value === 0, "gauge starts empty");
ok(!g.spend("bolt"), "can't spend bolt with no pressure");
ok(g.now().value === 0, "a refused spend must not change the meter");
g.step(2.5, false);
ok(Math.abs(g.now().value - 25) < 1e-6, `regen 10/s for 2.5s → ${g.now().value}, not 25`);
ok(g.spend("bolt"), "bolt spends at 24");
ok(Math.abs(g.now().value - 1) < 1e-6, `after bolt the meter is ${g.now().value}, not 1`);
g.step(1, true);
ok(Math.abs(g.now().value - 31) < 1e-6, `storm regen adds: got ${g.now().value}, want 31`);
g.step(0.4, true); // 31 + 12 → 43
ok(g.spend("storm"), "storm spends at 40 once filled");
ok(!g.spend("tornado"), "tornado costs more than what's left");

const f = cameraForward(0);
ok(Math.abs(f.x + 1) < 1e-6 && Math.abs(f.z) < 1e-6, `cameraForward(0) is ${JSON.stringify(f)}, not {-1,0}`);
ok(inCone(0, 0, 0, 1, 0, 5, 10, Math.cos((52 * Math.PI) / 180)), "point ahead is in the cone");
ok(!inCone(0, 0, 0, 1, 8, 1, 10, Math.cos((52 * Math.PI) / 180)), "point off to the side is outside the cone");
ok(thunderDelay(0) < thunderDelay(100), "farther strikes wait longer for thunder");
ok(thunderDelay(200) <= 1.6, "thunder delay is capped");

const cfg = {
  street: { z: 12.6, from: -48, to: 210 },
  city: {
    avenues: [{ z: 12.6, from: -48, to: 210 }],
    crosses: [{ x: 0, from: -20, to: 40 }],
    blocks: [{ id: "shop", x: 10, z: 20, w: 12, d: 10, h: 9 }],
  },
  buildings: {
    home: { origin: [0, 0], bounds: [-8, -6, 8, 6] },
  },
};
const near = nearestStructure(cfg, 9, 19);
ok(near && near.id === "shop", `nearestStructure near the shop is ${near && near.id}`);
const along = streetCourse(cfg, -5, 12.6, 1, 0);
ok(along.axis === "x" && along.dir === 1, `streetCourse along the avenue: ${JSON.stringify(along)}`);
const cross = streetCourse(cfg, 0.2, 5, 0, -1);
ok(cross.axis === "z" && cross.dir === -1, `streetCourse on a cross: ${JSON.stringify(cross)}`);

if (problems.length) {
  console.error("check-powers failed:");
  problems.forEach((p) => console.error(" -", p));
  process.exit(1);
}
console.log("check-powers: ok");
