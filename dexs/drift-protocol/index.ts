import axios from "axios";
import { CHAIN } from "../../helpers/chains";

const dailyVolEndpoint =
  "https://mainnet-beta.api.drift.trade/stats/24HourVolume";

async function fetch(type: "perp" | "spot") {
  const volumeResponse = await axios.get(
    `${dailyVolEndpoint}?${
      type === "perp" ? "perpMarkets" : "spotMarkets"
    }=true`
  );

  const rawVolumeQuotePrecision = volumeResponse.data.data.volume;

  // Volume will be returned in 10^6 precision
  const volumeNumber =
    rawVolumeQuotePrecision.length >= 6
      ? Number(rawVolumeQuotePrecision.slice(0, -6))
      : 0;

  return {
    dailyVolume: volumeNumber,
    timestamp: Date.now() / 1e3,
  };
}

const adapter = {
  breakdown: {
    swap: {
      [CHAIN.SOLANA]: {
        fetch: () => fetch("spot"),
        runAtCurrTime: true,
        start: async () => 0,
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: () => fetch("perp"),
        runAtCurrTime: true,
        start: async () => 0,
      },
    },
  },
};

export default adapter;
