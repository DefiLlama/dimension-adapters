import { Chain } from "@defillama/sdk/build/types";
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import customBackfill from "../helpers/customBackfill";
import fetchURL from "../utils/fetchURL";

type PoolHighLevelStats = {
    start_date: string,
    end_date: string;
    daily_volume_usd: number;
    total_volume_usd: number;
    daily_fee_usd: number;
    total_fee_usd: number;
}
async function fetch({
    startTimestamp,
    endTimestamp,
}: FetchOptions): Promise<FetchResultFees> {
    const endDate = new Date(endTimestamp * 1000).toISOString();
    const stats: PoolHighLevelStats = (await fetchURL(`https://datapi.adrena.xyz/pool-high-level-stats?end_date=${endDate}`)).data;

    // 100% fees redistributed to token holders:
    // - 20% to governance token holders + 10% used to buyback governance tokens
    // - 70% to pool token holders

    return {
        timestamp: startTimestamp,
        dailyFees: stats.daily_fee_usd,
        dailyRevenue: stats.daily_fee_usd * 30 / 100,
        dailyProtocolRevenue: 0,
        dailyHoldersRevenue: stats.daily_fee_usd * 30 / 100,
        dailySupplySideRevenue: stats.daily_fee_usd * 70 / 100,
        totalFees: stats.total_fee_usd,
        totalRevenue: stats.total_fee_usd * 30 / 100,
        totalProtocolRevenue: 0,
        totalSupplySideRevenue: stats.total_fee_usd * 70 / 100,
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            customBackfill: customBackfill(CHAIN.SOLANA as Chain, () => fetch),
            fetch,
            start: 1731921872,
            meta: {
                methodology: {
                    Fees: 'All fees accrued by liquidity pools.',
                    Revenue: '20% to gov token holder, 10% to buyback gov token, 0% to protocol.',
                    SupplySideRevenue: "70% to pool token holders.",
                },
            },
        },
    },
};

export default adapter;
