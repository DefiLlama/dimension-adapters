import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";

const HOTSTUFF_API_URL = "https://api.hotstuff.trade/info";

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();

    const marketsInfo = await postURL(HOTSTUFF_API_URL, {
        method: "instruments",
        params: {
            type: "spot",
        },
    })

    const marketIds: number[] = marketsInfo.spot.map((market: any) => market.id);

    await PromisePool.withConcurrency(10).for(marketIds).process(async (marketId) => {
        const marketInfo = await postURL(HOTSTUFF_API_URL, {
            method: "chart",
            params: {
                symbol: marketId.toString(),
                chart_type: "ltp",
                resolution: "1D",
                from: options.startOfDay,
                to: options.endTimestamp,
            },
        })
        const todaysData = marketInfo.filter((data: any) => data.time >= options.startOfDay * 1000 && data.time < options.endTimestamp * 1000);
        dailyVolume.addUSDValue(todaysData[0]?.volume ? (todaysData[0]?.volume * todaysData[0]?.close) : 0);
        await sleep(1000);
    });

    return { dailyVolume };
}

const methodology = { Volume: "Daily spot trading volume is taken from Hotstuff's candlestick API" };

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    chains: [CHAIN.HOTSTUFF],
    start: "2026-05-01"
}

export default adapter;
