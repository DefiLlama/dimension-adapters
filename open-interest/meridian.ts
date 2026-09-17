import { SimpleAdapter, FetchResult, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchUrl from "../utils/fetchURL";

const API = "https://api.meridian.xyz/v1";

async function fetch(_options: FetchOptions): Promise<FetchResult> {
    const products = (await fetchUrl(`${API}/product`)).data;

    const marketPrices = (await fetchUrl(`${API}/product/market-price?productIds=${products.map((market: any) => market.id).join('&productIds=')}`)).data;

    const openInterestAtEnd = products.reduce((acc: number, market: any) => {
        const price = +((marketPrices.find((priceEntry: any) => market.id === priceEntry.productId))?.oraclePrice || 0);
        // API openInterest is long + short; halve it to report single-sided OI
        // (matches PerpProduct.openInterest on the exchange contract)
        acc += price * +(market.openInterest || 0) / 2;
        return acc;
    }, 0);

    return {
        openInterestAtEnd,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ROBINHOOD],
    start: '2026-08-28',
    runAtCurrTime: true,
};

export default adapter;
