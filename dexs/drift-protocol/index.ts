import axios from "axios";
import { CHAIN } from "../../helpers/chains";

const dailyVolEndpoint =
  "https://mainnet-beta.api.drift.trade/stats/24HourVolume?allMarkets=true";

async function fetch() {
  const volumeResponse = await axios.get(dailyVolEndpoint);

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

export default {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: async () => 0,
    },
  },
};
