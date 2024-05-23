import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const dailyVolEndpoint =
  "https://mainnet-beta.api.drift.trade/stats/24HourVolume";

async function fetch(type: "perp" | "spot") {
  const volumeResponse = await httpGet(
    `${dailyVolEndpoint}?${
      type === "perp" ? "perpMarkets" : "spotMarkets"
    }=true`
  );

  const rawVolumeQuotePrecision = volumeResponse.data.volume;

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
        start: 1690239600,
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: () => fetch("perp"),
        runAtCurrTime: true,
        start: 1690239600,
      },
    },
  },
};

export default adapter;
