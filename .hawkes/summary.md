# Pilot: the AI that runs Small Weather's day
Pilot (js/pilot.js, `pilot` block in day.config.js, docs/voice-style.md, docs/world-bible.md) speaks in a radio-filtered voice (Gen voice gv_c2c9cdffeae27b99) through js/voice.js, with a wrist ring on his left hand and one caption line labelled Pilot.
Voiced: 48 clips in audio/pilot/ (take-over x3, let-go x12 naming the deed, worried x4, night x3 plus nightTrip, 25 schedule nudges). `node scripts/check-pilot.mjs` passes (75 lines, 48 clips).
Missing: pilot-sch-sleep.mp3 (job j_476f18801431 stayed queued, about $0.007); that line stays text-only, as do about 26 minor schedule lines. The whole set would be about $0.50 of the $0.74 budget.
I did not play it in a browser or phone-check the caption and ring; that is for beta's playtest.

Quality scan fix: Small Weather's Characters entry in docs/world-bible.md now lists talk (with idle and walk). npm test couldn't run here (modules missing, ERR_MODULE_NOT_FOUND); the change is docs only.
