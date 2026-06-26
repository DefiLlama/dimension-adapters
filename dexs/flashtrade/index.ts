import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
    const targetDate = options.dateString;

    // `source=all` returns the protocol's complete trading activity; omitting `poolName`
    // returns the per-pool breakdown for every pool, so new pools are picked up automatically.
    const url = `https://api.prod.flash.trade/pnl-info/cumulative-pool-pnl-per-day?startDate=${targetDate}%2000:00:00&endDate=${targetDate}%2023:59:59&source=all`;
    const res = await fetchURL(url);

    const poolsForDay: { [poolName: string]: { totalVolume: string } } = res[targetDate];

    if (!poolsForDay) {
        throw new Error(`No data found for date ${targetDate}`);
    }

    let dailyVolume = 0;
    for (const stats of Object.values(poolsForDay)) {
        dailyVolume += (Number(stats.totalVolume) / 1e6) || 0;
    }

    return { dailyVolume }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2023-12-29',
}

export default adapter;
