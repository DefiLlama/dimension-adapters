import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchUrl from "../utils/fetchURL";

async function fetch() {
    const [{ ois }, { tickers }] = await Promise.all([
        fetchUrl("https://server-prod.hz.vestmarkets.com/v2/oi"),
        fetchUrl("https://server-prod.hz.vestmarkets.com/v2/ticker/latest")
    ]);

    const openInterest = ois.reduce((acc: any, market: any) => {
        const curPrice = + (tickers.find((ticker: any) => ticker.symbol === market.symbol)?.indexPrice || 0);
        acc.shortOi += +market.shortOi * curPrice;
        acc.longOi += +market.longOi * curPrice;
        return acc;
    }, { shortOi: 0, longOi: 0 });

    return {
        shortOpenInterestAtEnd: openInterest.shortOi,
        longOpenInterestAtEnd: openInterest.longOi,
        openInterestAtEnd: openInterest.shortOi + openInterest.longOi
    };
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    runAtCurrTime: true
}

export default adapter;