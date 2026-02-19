import fetchURL from "../../utils/fetchURL";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";

// Main API url to hit
const API_URL = "https://api.seer.coinhall.org/api/hallswap/metrics";
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

const fetch = async (options: FetchOptions) => {
  const chain = (CHAINS as any)[options.chain];
  const timestampMillis = options.toTimestamp * 1_000;
  const dayBeforeMillis = timestampMillis - DAY_IN_MILLIS;
  const dailyVolume = await fetchURL(
    `${API_URL}?chains=${chain}&from=${dayBeforeMillis}&to=${timestampMillis}`
  );
  return {
    dailyVolume: dailyVolume[chain],
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.entries(CHAINS).reduce(
    (acc, [defillamaChain, _]) => {
      acc[defillamaChain] = {
        fetch,
        start: '2021-12-01', // The first launch of Hallswap (1st December 2021)
      };
      return acc;
  }, {} as BaseAdapter),
};

export default adapter;
