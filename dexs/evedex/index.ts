import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { PromisePool } from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";

const MARKETS_ENDPOINT = "https://exchange-api.evedex.com/api/market/instrument";
const OHLCV_ENDPOINT = "https://market-data-api.evedex.com/api/history";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const marketsData = await fetchURL(MARKETS_ENDPOINT);
    const markets = marketsData.map(market => market.name);

    const after = new Date(options.startOfDay * 1000).toISOString();
    const before = new Date(options.endTimestamp * 1000).toISOString();

    await PromisePool.withConcurrency(1)
        .for(markets)
        .process(async (market) => {
            const ohlcvData = await fetchURLAutoHandleRateLimit(`${OHLCV_ENDPOINT}/${market}/list?after=${after}&before=${before}&group=1d`);
            const todaysData = ohlcvData.filter(data => data[0] >= options.startOfDay * 1000 && data[0] < options.endTimestamp * 1000);
            dailyVolume.addUSDValue((todaysData[0]?.[5] ?? 0) / 2); //They count both maker and taker volume in candles
            await sleep(1000);
        });

    return {
        dailyVolume,
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.EVENTUM],
    start: "2025-06-30",
};

export default adapter;