// The neighbours-helped counter's pure store (js/helped.js): a day's record, one count per neighbour, a new date starts empty.
import { readHelped, addHelped } from "../js/helped.js";
const fail = [];
let r = readHelped(null, "2026-11-14");
if (r.who.length) fail.push("empty store isn't empty");
let a = addHelped(r, "birdie");
if (!a.fresh || a.rec.who.length !== 1) fail.push("first help doesn't count");
a = addHelped(a.rec, "Birdie");
if (a.fresh || a.rec.who.length !== 1) fail.push("the same neighbour counted twice");
a = addHelped(a.rec, "quill");
if (a.rec.who.join() !== "birdie,ines") fail.push("quill should count as ines: " + a.rec.who);
if (readHelped(JSON.stringify(a.rec), "2026-11-14").who.length !== 2) fail.push("same-day reload loses the count");
if (readHelped(JSON.stringify(a.rec), "2026-11-15").who.length !== 0) fail.push("a new date keeps yesterday's count");
if (readHelped("{bad", "2026-11-14").who.length) fail.push("bad store not empty");
if (fail.length) { console.error("check-helped FAILED:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("check-helped ok");
