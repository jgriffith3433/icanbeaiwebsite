// The loop-seam logic (moved out of js/score.js: it used to run in the browser over every decoded bed).
// Pure: works on { sampleRate, length, numberOfChannels, getChannelData(c) }. Used by scripts/bake-loop-seams.mjs
// (once, offline) and by scripts/check-score.mjs.
//
// 1. Look at the 50 ms RMS envelope at head and tail and trim any silent hole / fade dip.
// 2. Fold the tail overlap into the head with an equal-power crossfade (sin/cos) so the last sample
//    wraps straight into the first with no discontinuity.
export function fixLoopSeam(buf, fadeSec = 0.85) {
  if (!buf || typeof buf.getChannelData !== "function" || !buf.length || !buf.sampleRate) {
    return { buffer: buf, trimmedSamples: 0, fadeSamples: 0, jumpBefore: 0, jumpAfter: 0, levelDiffDb: 0 };
  }
  const sr = buf.sampleRate;
  const chCount = buf.numberOfChannels || 1;
  const total = buf.length;
  const ch0 = buf.getChannelData(0);
  const jumpBefore = Math.abs(ch0[total - 1] - ch0[0]);

  const win = Math.max(1, Math.floor(sr * 0.05));
  const nWins = Math.floor(total / win);
  if (nWins < 8) {
    return { buffer: buf, trimmedSamples: 0, fadeSamples: 0, jumpBefore, jumpAfter: jumpBefore, levelDiffDb: 0 };
  }

  const rmsList = new Float32Array(nWins);
  const sorted = [];
  for (let w = 0; w < nWins; w++) {
    let sum = 0;
    const base = w * win;
    for (let i = 0; i < win; i++) {
      const v = ch0[base + i];
      sum += v * v;
    }
    const r = Math.sqrt(sum / win);
    rmsList[w] = r;
    if (r > 1e-5) sorted.push(r);
  }
  sorted.sort((a, b) => a - b);
  const medRms = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
  const floorRms = medRms * 0.22;

  let startWin = 0;
  let endWin = nWins;
  while (startWin < endWin - 6 && rmsList[startWin] < floorRms) startWin++;
  while (endWin > startWin + 6 && rmsList[endWin - 1] < floorRms) endWin--;

  const startSample = startWin * win;
  const endSample = Math.min(total, endWin * win);
  const activeLen = endSample - startSample;
  const trimmedSamples = total - activeLen;
  const fadeSamples = Math.max(64, Math.min(Math.floor(sr * fadeSec), Math.floor(activeLen * 0.25)));
  const outLen = activeLen - fadeSamples;
  if (outLen <= fadeSamples) {
    return { buffer: buf, trimmedSamples: 0, fadeSamples: 0, jumpBefore, jumpAfter: jumpBefore, levelDiffDb: 0 };
  }

  const chans = Array.from({ length: chCount }, () => new Float32Array(outLen));
  const outBuf = {
    sampleRate: sr,
    length: outLen,
    duration: outLen / sr,
    numberOfChannels: chCount,
    getChannelData: (c) => chans[c],
  };

  for (let c = 0; c < chCount; c++) {
    const src = buf.getChannelData(c);
    const dst = chans[c];
    for (let i = 0; i < fadeSamples; i++) {
      const ang = (i / fadeSamples) * Math.PI * 0.5;
      dst[i] = src[startSample + i] * Math.sin(ang) + src[startSample + outLen + i] * Math.cos(ang);
    }
    for (let i = fadeSamples; i < outLen; i++) dst[i] = src[startSample + i];
  }

  const out0 = chans[0];
  const jumpAfter = Math.abs(out0[outLen - 1] - out0[0]);
  let headSum = 0;
  let tailSum = 0;
  for (let i = 0; i < win; i++) {
    headSum += out0[i] * out0[i];
    tailSum += out0[outLen - win + i] * out0[outLen - win + i];
  }
  const rmsHead = Math.sqrt(headSum / win);
  const rmsTail = Math.sqrt(tailSum / win);
  const levelDiffDb = rmsHead > 1e-6 && rmsTail > 1e-6 ? 20 * Math.log10(rmsTail / rmsHead) : 0;

  return {
    buffer: outBuf,
    trimmedSamples,
    fadeSamples,
    jumpBefore: Math.round(jumpBefore * 1e6) / 1e6,
    jumpAfter: Math.round(jumpAfter * 1e6) / 1e6,
    levelDiffDb: Math.round(levelDiffDb * 100) / 100,
  };
}
