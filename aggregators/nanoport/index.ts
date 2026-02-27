import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const EXECUTOR = "0xF0E9286CfCB75c94ac19E99bCD93D814da55e304";

const chains: Record<string, any> = {
    [CHAIN.ETHEREUM]: { duneChain: "ethereum" },
    [CHAIN.ARBITRUM]: { duneChain: "arbitrum" },
    [CHAIN.OPTIMISM]: { duneChain: "optimism" },
    [CHAIN.BASE]: { duneChain: "base" },
    [CHAIN.POLYGON]: { duneChain: "polygon" },
    [CHAIN.BSC]: { duneChain: "bnb" },
    [CHAIN.AVAX]: { duneChain: "avalanche_c" },
};

const prefetch = async (options: FetchOptions) => {
    return queryDuneSql(options, `
    SELECT
      blockchain,
      COALESCE(SUM(amount_usd), 0) AS volume
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

const methodology = {
    DailyVolume:
        "Volume is calculated by summing the USD value of all swaps executed through the NanoPort executor wallet across supported DEX aggregators.",
};

const adapter: SimpleAdapter = {
    prefetch,
    version: 1,
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
    fetch,
    start: "2026-02-10",
    adapter: chains,
    methodology,
};

export default adapter;
