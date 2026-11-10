/* ==========================================================================
   Spoken dialogue: the story parts' lines (`say` in day.config.js episodes) and the neighbors' beats, each in
   its speaker's voice (day.config.js `dialogue.cast`), from Hawkes Gen audio.voice (ElevenLabs). The recipes
   are in hawkes.assets.json (ids `dlg-*`, files under audio/dialogue/).
   Only files that are in the build play: audio/dialogue/index.json lists them (vite.config.js writes it at
   build from what's on disk; the committed one is what's in the repo). A line without a file keeps its text
   and js/sfx.js's babble, so nothing 404s. Nothing plays until Sound is on. One speaker at a time: a new line
   stops the last. The music ducks under it (`day:dialogue`, js/score.js).
   ========================================================================== */

/** FNV-1a, 32 bit, base 36: the stable part of a line's id, from who says it and what they say. */
export function lineHash(who, text) {
  let h = 0x811c9dc5;
  const s = `${who}|${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The line's id and file: dlg-<who>-<hash>, audio/dialogue/<id>.mp3. */
export function lineId(who, text) {
  return `dlg-${slug(who)}-${lineHash(who, text)}`;
}

/* His own lines in a scene speak as him; a "He" line that talks about him in the third person ("He knows.")
   is narration, kept as text. */
const NARRATION = /\b(he|him|his|himself)\b/i;

/**
 * Every line with a voice: { id, who, text, voice, file, where }. Story `say` lines (any episode), then the
 * neighbors' beats (who is the neighbor's first name). Same order every time; one entry per distinct line.
 */
export function dialogueLines(config) {
  const C = config || {};
  const D = C.dialogue || {};
  const cast = D.cast || {};
  const extras = D.extras || [];
  const voiceFor = (who) => {
    if (cast[who]) return cast[who];
    if (!extras.length) return null;
    return extras[parseInt(lineHash(who, ""), 36) % extras.length];
  };
  const out = [];
  const seen = new Set();
  const add = (who, text, where) => {
    if (!who || !text) return;
    if (who === "He" && NARRATION.test(text)) return;
    const id = lineId(who, text);
    if (seen.has(id)) return;
    const voice = voiceFor(who);
    if (!voice) return;
    seen.add(id);
    out.push({ id, who, text, voice, file: `audio/dialogue/${id}.mp3`, where });
  };
  const eps = (C.episodes && C.episodes.list) || [];
  eps.forEach((ep) => {
    const say = ep && ep.say;
    if (!say) return;
    Object.keys(say).forEach((key) => (say[key] || []).forEach((l) => add(l[0], l[1], `${ep.id}:${key}`)));
  });
  const people = (C.neighbors && C.neighbors.list) || [];
  people.forEach((p) => (p.beats || []).forEach((b) => add(neighborWho(p), b.text, `neighbor:${b.id}`)));
  // Small Weather's spoken bark table (voice.spoken): first-person lines for the voice director.
  const spoken = (C.voice && C.voice.spoken) || {};
  Object.keys(spoken).forEach((group) => {
    const pool = spoken[group];
    if (!Array.isArray(pool)) return;
    pool.forEach((text) => add("He", text, `voice:${group}`));
  });
  return out;
}

/** The name a neighbor speaks under: their first name, as the story's lines call them (Birdie, Dex, Ines). */
export function neighborWho(p) {
  const n = (p && (p.who || p.name)) || "";
  return String(n).split(" ")[0];
}

function soundOn() {
  const btn = typeof document !== "undefined" && document.getElementById && document.getElementById("sound");
  return !!(btn && btn.getAttribute("aria-pressed") === "true");
}

function voicesOn() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("icanbe.voices") === "off") return false;
  } catch (err) {
    /* private */
  }
  const btn = typeof document !== "undefined" && document.getElementById && document.getElementById("voices");
  if (btn) return btn.getAttribute("aria-pressed") === "true";
  return true;
}

export function startDialogue(dayApi, opts) {
  const day = dayApi || (typeof window !== "undefined" && window.day);
  if (!day || day.dialogue) return day && day.dialogue;
  const o = opts || {};
  const C = (typeof window !== "undefined" && window.DAY_CONFIG) || {};
  const D = C.dialogue || {};
  const volume = D.volume != null ? D.volume : 0.9;
  const lines = dialogueLines(C);
  const byKey = new Map(lines.map((L) => [`${L.who}|${L.text}`, L]));
  const people = (C.neighbors && C.neighbors.list) || [];
  const beats = new Map();
  people.forEach((p) => (p.beats || []).forEach((b) => beats.set(b.id, { who: neighborWho(p), text: b.text })));

  let present = new Set(o.files || []);
  let current = null;
  const live = { played: 0, last: null, files: present.size, lines: lines.length };
  const AudioCtor = o.Audio || (typeof Audio !== "undefined" ? Audio : null);

  if (!o.files && typeof fetch === "function") {
    fetch("audio/dialogue/index.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j) => {
        present = new Set((j && j.files) || []);
        live.files = present.size;
      })
      .catch(() => {});
  }

  const find = (who, text) => {
    const L = byKey.get(`${who}|${text}`);
    return L && present.has(L.file) ? L : null;
  };

  function emit(detail) {
    if (typeof window === "undefined" || typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:dialogue", { detail }));
    } catch (err) {
      /* node */
    }
  }

  /** Speak a line if it has a file and Sound is on. Returns the line, or null (the text and babble carry it). */
  function speak(who, text) {
    const L = find(who, text);
    if (!L || !AudioCtor || !(o.soundOn ? o.soundOn() : soundOn()) || !(o.voicesOn ? o.voicesOn() : voicesOn())) return null;
    if (current) {
      try {
        current.pause();
      } catch (err) {
        /* already gone */
      }
    }
    const a = new AudioCtor(L.file);
    a.volume = volume;
    current = a;
    const p = a.play && a.play();
    if (p && p.catch) p.catch(() => {});
    live.played++;
    live.last = { id: L.id, who, text };
    emit({ action: "say", id: L.id, who });
    return L;
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("day:story", (e) => {
      const d = (e && e.detail) || {};
      if (d.action === "say") speak(d.who, d.text);
    });
    window.addEventListener("day:neighbor", (e) => {
      const d = (e && e.detail) || {};
      if (d.action !== "beat") return;
      const b = beats.get(d.beat);
      if (b) speak(b.who, b.text);
    });
  }

  const api = {
    /** True when this line will be heard as a clip (js/sfx.js then skips its babble). */
    voiced: (who, text) => !!find(who, text) && (o.soundOn ? o.soundOn() : soundOn()),
    beatVoiced: (beatId) => {
      const b = beats.get(beatId);
      return !!b && api.voiced(b.who, b.text);
    },
    speak,
    lines: () => lines.slice(),
    now: () => Object.assign({}, live),
  };
  day.dialogue = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startDialogue(window.day);
}
