import fetchURL from "../../utils/fetchURL";
import { FetchV2, SimpleAdapter } from "../../adapters/types";

// Main API url to hit
const API_URL = "https://api.seer.coinhall.org/api/hallswap/metrics";
// The first launch of Hallswap (1st December 2021)
const START_TIMESTAMP = 1638316800;
// Map of the chain names used by defillama to the chain names used by hallswap
const CHAINS = {
  archway: "archway",
  chihuahua: "chihuahua",
  dymension: "dymension",
  injective: "injective",
  juno: "juno",
  kujira: "kujira",
  migaloo: "migaloo",
  neutron: "neutron",
  orai: "oraichain",
  osmosis: "osmosis",
  sei: "sei",
  solana: "solana",
  // terra: "terraclassic",
  terra2: "terra",
} as const;
// Number of milliseconds in a day (24 hours)
const DAY_IN_MILLIS = 86_400_000;

const fetch =
  (chain: string): FetchV2 =>
  async (options) => {
    const timestampMillis = options.toTimestamp * 1_000;
    const dayBeforeMillis = timestampMillis - DAY_IN_MILLIS;
    const dailyVolume = await fetchURL(
      `${API_URL}?chains=${chain}&from=${dayBeforeMillis}&to=${timestampMillis}`
    );
    const totalVolume = await fetchURL(
      `${API_URL}?chains=${chain}&to=${timestampMillis}`
    );
    return {
      dailyVolume: dailyVolume[chain],
      totalVolume: totalVolume[chain],
      timestamp: options.toTimestamp,
    };
  };

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
};
for (const [defillamaChain, hallswapChain] of Object.entries(CHAINS)) {
  adapter.adapter[defillamaChain] = {
    fetch: fetch(hallswapChain),
    start: START_TIMESTAMP,
  };
}

export default adapter;
