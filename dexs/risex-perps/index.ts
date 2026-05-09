import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { PromisePool } from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";

const RISEX_API_URL = "https://api.rise.trade/api/v1";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const NANOSECONDS_IN_SECOND = 1000000000;

const fetch = async (_: any, __: any, options: FetchOptions) => {
    const marketsResponse = await fetchURL(`${RISEX_API_URL}/markets`);

    const marketIds = marketsResponse.data.markets.map((market: any) => Number(market.market_id));

    const nanosecondsInOneDay = ONE_DAY_IN_SECONDS * NANOSECONDS_IN_SECOND;
    const from = options.startOfDay * NANOSECONDS_IN_SECOND;
    const to = from + nanosecondsInOneDay;

    const dailyVolume = options.createBalances();

    const { errors } = await PromisePool.withConcurrency(1)
        .for(marketIds)
        .process(async (marketId) => {
            const marketData = await fetchURLAutoHandleRateLimit(`${RISEX_API_URL}/trading-view-data?market_id=${marketId}&interval=${nanosecondsInOneDay}&from=${from}&to=${to}`);
            let todaysData;
            if (marketData.data.data.length !== 1) {
                todaysData = marketData.data.data.find((data: any) => data.time >= from && data.time < to);
                if (!todaysData) {
                    console.warn(`No RiseX candle found for market ${marketId} in [${from}, ${to}), skipping`);
                    return;
                }
            }
            else {
                todaysData = marketData.data.data[0];
            }
            dailyVolume.addUSDValue(Number(todaysData.close) * Number(todaysData.volume));
            await sleep(1000);
        });

    if (errors?.length) {
        throw new Error(`Failed to fetch data for ${errors.length} markets`);
    }

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.RISE],
    start: "2026-04-01",
    methodology: {
        Volume: "24h perpetual trading volume from Rise Trade's API.",
    },
};

export default adapter;
