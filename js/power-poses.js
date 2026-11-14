/* Which hero clip each power's wind-up and cast plays (one table: js/powers.js pose() and js/small-weather.js read it,
   and scripts/check-idle-pose.mjs walks every entry, so a new power is covered by the idle-pose check by itself). */
export const POWER_POSE = {
  lightning: "windbolt", storm: "windbolt", bolt: "windbolt",
  rain: "windrain", fog: "windrain", sun: "windrain", sunbreak: "windrain",
  wind: "windrain", gust: "windrain", gale: "windrain", tornado: "windrain",
};
export const powerPose = (id) => POWER_POSE[id] || "cast";
