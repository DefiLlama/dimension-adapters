import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<string, any> = {
    [CHAIN.ETHEREUM]: { duneChain: "ethereum", start: "2023-05-22" },
    [CHAIN.ARBITRUM]: { duneChain: "arbitrum", start: "2024-01-20" },
    [CHAIN.BASE]: { duneChain: "base", start: "2023-11-01" },
}

const prefetch = async (options: FetchOptions) => {
    const duneResult = await queryDuneSql(options, `
    SELECT
      blockchain,
      COALESCE(SUM(amount_usd), 0) as usd_volume
    FROM nft.trades
    WHERE project = 'sudoswap'
      AND version = 'v2'
      AND TIME_RANGE
    GROUP BY blockchain
    `);
    return duneResult;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const duneResult = options.preFetchedResults;
    const dailyVolume = duneResult.find((item: any) => item.blockchain === chainConfig[options.chain].duneChain)?.usd_volume || 0;

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    prefetch,
    fetch,
    version: 1,
    adapter: chainConfig,
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
};

export default adapter;
