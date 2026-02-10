import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const EXECUTOR = "0xF0E9286CfCB75c94ac19E99bCD93D814da55e304";

const chains: Record<string, { duneChain: string; start: string }> = {
  [CHAIN.ETHEREUM]: { duneChain: "ethereum", start: "2026-02-10" },
  [CHAIN.ARBITRUM]: { duneChain: "arbitrum", start: "2026-02-10" },
  [CHAIN.OPTIMISM]: { duneChain: "optimism", start: "2026-02-10" },
  [CHAIN.BASE]: { duneChain: "base", start: "2026-02-10" },
  [CHAIN.POLYGON]: { duneChain: "polygon", start: "2026-02-10" },
  [CHAIN.BSC]: { duneChain: "bnb", start: "2026-02-10" },
  [CHAIN.AVAX]: { duneChain: "avalanche_c", start: "2026-02-10" },
};

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    SELECT
      blockchain,
      SUM(amount_usd) AS volume
    FROM dex.trades
    WHERE tx_from = ${EXECUTOR}
    AND block_time >= from_unixtime(${options.startTimestamp})
    AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY blockchain
  `);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const chainConfig = chains[options.chain];
  if (!chainConfig) return { dailyVolume: 0 };

  const data = options.preFetchedResults || [];
  const chainData = data.find(
    (item: any) => item.blockchain === chainConfig.duneChain
  );

  return {
    dailyVolume: chainData?.volume || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: Object.fromEntries(
    Object.entries(chains).map(([chain, { start }]) => [
      chain,
      { fetch, start },
    ])
  ),
  prefetch,
  methodology: {
    dailyVolume:
      "Volume is calculated by summing the USD value of all swaps executed through the NanoPort executor wallet across supported DEX aggregators.",
  },
};

export default adapter;
