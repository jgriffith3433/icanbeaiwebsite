// js/variety.js: every pick is 5-10% off its base and no id repeats a rate within 60 s.
import { pickRate, resetVariety, MIN_GAP } from '../js/variety.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.error('FAIL', m); } };
resetVariety();
const seen = [];
for (let i = 0; i < 30; i++) {
  const r = pickRate('thunder', 1, { now: i * 0.4 }); // 30 plays in 12 s
  ok(Math.abs(r - 1) >= 0.0499 && Math.abs(r - 1) <= 0.1001, 'rate ' + r + ' outside the jitter band');
  ok(!seen.some((s) => Math.abs(s - r) < MIN_GAP), 'repeat ' + r);
  seen.push(r);
}
const b = pickRate('cast', 0.8, { now: 0 });
ok(Math.abs(b / 0.8 - 1) >= 0.0499 && Math.abs(b / 0.8 - 1) <= 0.1001, 'base rate kept: ' + b);
const a = [1, 2, 3].map((n) => pickRate('same', 1, { now: n })); // the same power three times in a row
ok(new Set(a).size === 3, 'three casts, three rates');
if (bad) process.exit(1);
console.log('variety ok');
