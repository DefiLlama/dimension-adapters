import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { httpGet } from "../../utils/fetchURL";

const INDEXER = "https://deepbook-indexer.mainnet.mystenlabs.com";

interface Pool {
  pool_name: string;
  quote_asset_id: string;
}

const fetch = async (options: FetchOptions) => {
  const volumeUrl = `${INDEXER}/all_historical_volume?start_time=${options.startTimestamp}&end_time=${options.endTimestamp}&volume_in_base=false`;
  // the pool list is the same for every hourly slot, so it is fetched once per run
  const [pools, volumeByPool]: [Pool[], Record<string, number>] = await Promise.all([
    getConfig("deepbookv3-sui/pools", `${INDEXER}/get_pools`),
    httpGet(volumeUrl),
  ]);

  if (!Array.isArray(pools) || !pools.length)
    throw new Error("DeepBook indexer returned no pools");
  if (!volumeByPool || typeof volumeByPool !== "object" || Array.isArray(volumeByPool))
    throw new Error("DeepBook indexer returned an unexpected volume payload");

  const quoteByPool: Record<string, string> = {};
  pools.forEach((pool) => (quoteByPool[pool.pool_name] = pool.quote_asset_id));

  const dailyVolume = options.createBalances();
  Object.entries(volumeByPool).forEach(([poolName, poolVolume]) => {
    const quoteToken = quoteByPool[poolName];
    if (!quoteToken) throw new Error(`DeepBook pool ${poolName} is missing from /get_pools`);
    dailyVolume.add(quoteToken, poolVolume);
  });

  return { dailyVolume };
};

const methodology = {
  Volume: "Value of every trade matched on DeepBook's order books, measured in the pool's quote coin. Each trade is counted once, from the taker's side. Trades in pools that DeepBook's own indexer does not list are not included.",
};

export default {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: "2024-10-01",
    },
  },
} as SimpleAdapter;
