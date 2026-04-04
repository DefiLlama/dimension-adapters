import { FetchOptions } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PromisePool } from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";

const PERP_API_URL = 'https://perp-api.phoenix.trade/v1';

async function fetch(_: any, __: any, options: FetchOptions) {
    const dailyVolume = options.createBalances();

    const marketsData = await fetchURL(`${PERP_API_URL}/view/markets`);
    const markets = marketsData.markets.map((market: any) => market.symbol);

    const startTime = options.startOfDay * 1000;
    const endTime = (options.endTimestamp) * 1000;

    await PromisePool.withConcurrency(1)
        .for(markets)
        .process(async (market) => {
            const ohlcvData = await fetchURLAutoHandleRateLimit(`${PERP_API_URL}/candles/${market}?timeframe=1d&limit=300&startTime=${startTime}&endTime=${endTime}`);
            const todaysData = ohlcvData.filter((data: any) => data.time >= startTime && data.time < endTime);
            dailyVolume.addUSDValue(todaysData[0]?.volume ?? 0);
            await sleep(1000);
        });

    return {
        dailyVolume,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-11-18',
}

export default adapter;
