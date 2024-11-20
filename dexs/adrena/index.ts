import { Chain } from "@defillama/sdk/build/types";
import { BreakdownAdapter, ProtocolType, FetchResultVolume, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import fetchURL from "../../utils/fetchURL";

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
}: FetchOptions): Promise<FetchResultVolume> {
    const endDate = new Date(endTimestamp * 1000).toISOString();
    const stats: PoolHighLevelStats = (await fetchURL(`https://datapi.adrena.xyz/pool-high-level-stats?end_date=${endDate}`)).data;
    
    return {
        dailyVolume: stats.daily_volume_usd,
        totalVolume: stats.total_volume_usd,
        timestamp: startTimestamp,
    }
}

const adapter: BreakdownAdapter = {
    version: 2,
    breakdown: {
        perp: {
            [CHAIN.SOLANA]: {
                customBackfill: customBackfill(CHAIN.SOLANA as Chain, () => fetch),
                fetch,
                start: 1731921872,
                meta: {
                    methodology: {
                        Volumes: 'Sum of all open/close/increase/liquidate position volumes.',
                    },
                },
            }
        }
    },
    protocolType: ProtocolType.PROTOCOL,
}

export default adapter;
