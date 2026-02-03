import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// const marketsCombinedVolumeDaily = "https://api.prod.flash.trade/market-stats";

const pools = [
    "Crypto.1",
    "Virtual.1",
    "Governance.1",
    "Community.1",
    "Community.2",
    "Trump.1",
    "Ore.1",
    "Remora.1",
    
    // keep historical pools
    "Community.3",
]
/**
 * NOTE: API experienced outage on 2025-01-27 and 2025-01-28.
 * Data is now available.
 */
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const targetDate = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

    let dailyVolume = 0;
    for (const pool of pools) {
        const url = `https://api.prod.flash.trade/pnl-info/cumulative-pnl-per-day?poolName=${pool}&startDate=2023-01-01%2000:00:00&endDate=${targetDate}%2023:59:59`;
        try {
            const res = await fetchURL(url);
            dailyVolume += (res[targetDate]?.totalVolume / 1e6) || 0;
        } catch {
            // Treat failures as zero volume and continue with the remaining pools
            continue;
        }
    }
    return { dailyVolume }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2023-12-29'
        }
    },
}

export default adapter;
