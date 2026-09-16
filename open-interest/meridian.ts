import { SimpleAdapter, FetchResult, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchUrl from "../utils/fetchURL";

const API = "https://api.meridian.xyz/v1";

async function fetch(_options: FetchOptions): Promise<FetchResult> {
    const products = (await fetchUrl(`${API}/product`)).data;

    const marketPrices = (await fetchUrl(`${API}/product/market-price?productIds=${products.map((market: any) => market.id).join('&productIds=')}`)).data;

    const openInterestAtEnd = products.reduce((acc: number, market: any) => {
        const price = +((marketPrices.find((priceEntry: any) => market.id === priceEntry.productId))?.oraclePrice || 0);
        acc += price * +(market.openInterest || 0);
        return acc;
    }, 0);

    return {
        openInterestAtEnd,
    };
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.ROBINHOOD],
    fetch,
    runAtCurrTime: true,
};

export default adapter;
