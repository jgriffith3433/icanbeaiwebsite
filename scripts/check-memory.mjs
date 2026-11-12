// Checks js/memory.js's store: zones, real-date keys, the 3-day fade, the 20-decal cap, since().
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
const M = await import(pathToFileURL(path.join(root, "js/memory.js")).href);

ok(M.zoneOf(0, 40) === "park" && M.zoneOf(115, 25) === "plaza" && M.zoneOf(50, 0) === "shop" && M.zoneOf(190, 44) === "tank" && M.zoneOf(70, 12.6) === "avenue" && M.zoneOf(70, 80) === "street", "zoneOf");
ok(M.dateKey(new Date(2026, 10, 11, 23, 59).getTime(), 0) === "2026-11-11", "dateKey");
ok(M.dateKey(new Date(2026, 10, 30, 8).getTime(), 1) === "2026-12-01", "dateKey +1 crosses a month");
ok(M.dayDiff("2026-11-11", "2026-11-14") === 3, "dayDiff");
ok(M.strength("2026-11-11", "2026-11-11") === 1, "strength today");
ok(Math.abs(M.strength("2026-11-11", "2026-11-12") - 2 / 3) < 1e-9, "strength +1 day");
ok(M.strength("2026-11-11", "2026-11-14") === 0, "strength +3 days is 0");

const s = M.emptyStore();
M.addDeed(s, "2026-11-11", "power", "park", "rain");
M.addMark(s, "2026-11-11", { kind: "scorch", x: 70, z: 12.6 });
ok(M.liveFlag(s, "2026-11-11", M.parkRain) === 1, "park rain flag today");
ok(M.liveFlag(s, "2026-11-14", M.parkRain) === 0, "park rain gone at +3 days");
ok(M.liveMarks(s, "2026-11-11").length === 1 && M.liveMarks(s, "2026-11-14").length === 0, "marks live today, gone at +3");
ok(M.liveMarks(s, "2026-11-12")[0].k < 1, "marks fade after today");
for (let i = 0; i < 30; i++) M.addMark(s, "2026-11-11", { kind: "bin", x: i, z: 9.8 });
ok(M.liveMarks(s, "2026-11-11").length === M.CAP, "at most 20 decals kept");
ok(M.liveMarks(s, "2026-11-11", M.LOW_CAP).length === M.LOW_CAP, "low quality draws 6");
ok(M.sinceDays(s, "2026-11-11", 1).zones.park.rain === 1 && M.sinceDays(s, "2026-11-13", 1).zones.park === undefined, "since()");
ok(M.parse("not json").v === 1, "parse survives junk");
ok(M.emptyArcs && M.emptyArcs().birdie === 0 && M.emptyArcs().quill === 0, "emptyArcs");
const withArcs = M.parse(JSON.stringify({ v: 1, days: {}, arcs: { birdie: 2, dex: 9, quill: -1 } }));
ok(withArcs.arcs.birdie === 2 && withArcs.arcs.dex === 3 && withArcs.arcs.quill === 0, "parse clamps arcs 0..3");
M.prune(s, "2026-12-30"); ok(!Object.keys(s.days).length, "prune");
if (problems.length) { console.error("check-memory failed:"); problems.forEach((p) => console.error(" -", p)); process.exit(1); }
console.log("check-memory: ok");
