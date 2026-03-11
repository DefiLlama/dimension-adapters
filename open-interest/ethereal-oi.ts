import { SimpleAdapter, FetchResult, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchUrl from "../utils/fetchURL";

async function fetch(_a: any, _b: any, _c: FetchOptions): Promise<FetchResult> {

    const tradeData = (await fetchUrl("https://api.ethereal.trade/v1/product")).data;

    const marketPrice = (await fetchUrl(`https://api.ethereal.trade/v1/product/market-price?productIds=${tradeData.map((market: any) => market.id).join('&productIds=')}`)).data;

    const openInterestAtEnd = tradeData.reduce((acc: number, market: any) => {
        const price = + ((marketPrice.find((priceEntry: any) => market.id === priceEntry.productId))?.oraclePrice || 0);
        acc+= price * +(market.openInterest || 0);
        return acc;
    }, 0);

    return {
        openInterestAtEnd,
    }
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.ETHEREAL],
    fetch,
    runAtCurrTime: true
}

export default adapter;