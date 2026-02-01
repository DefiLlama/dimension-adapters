const axios = require("axios");

const API_BASE = "https://api.gifted.markets";

async function fetch(timestamp) {
  const url = `${API_BASE}/defillama/volume`;
  const r = await axios.get(url, {
    params: { timestamp },
    timeout: 20_000,
  });

  const dailyVolume = Number(r.data?.dailyVolumeUsd ?? 0);

  if (!Number.isFinite(dailyVolume) || dailyVolume < 0) {
    throw new Error(`Invalid dailyVolumeUsd from ${url}: ${r.data?.dailyVolumeUsd}`);
  }

  return {
    dailyVolume,
  };
}

module.exports = {
  timetravel: true,
  start: 1769904000, // 2026-02-01 00:00:00 UTC
  methodology:
    "Daily volume is derived from Gifted Markets TON hot-wallet on-chain spend for completed purchases (excluding internal transfers/refunds) and converted to USD.",
  fetch,
};
