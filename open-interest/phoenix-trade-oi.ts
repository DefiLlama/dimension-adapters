import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const PHOENIX_TRADE_API_URL = 'https://perp-api.phoenix.trade/v1/view';

async function fetch(options: FetchOptions) {
    const marketsData = await fetchURL(`${PHOENIX_TRADE_API_URL}/markets`);
    const markets = marketsData.markets.map((market: any) => market.symbol);
    const openInterestAtEnd = options.createBalances();

    await PromisePool.withConcurrency(1)
        .for(markets)
        .process(async (market) => {
            const marketData = await fetchURLAutoHandleRateLimit(`${PHOENIX_TRADE_API_URL}/market/${market}`);
            openInterestAtEnd.addUSDValue(Number(marketData.market.openInterest.ui) * Number(marketData.market.markPrice.price));
            await sleep(1000);
        });

    return {
        openInterestAtEnd,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    runAtCurrTime: true,
    chains: [CHAIN.SOLANA],
}

export default adapter;