import { SimpleAdapter, FetchResult, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

async function fetch(_a: any, _b: any, _c: FetchOptions): Promise<FetchResult> {

    const tradeData = (await fetchUrl("https://api.ethereal.trade/v1/product")).data;

    const marketPrice = (await fetchUrl(`https://api.ethereal.trade/v1/product/market-price?productIds=${tradeData.map((market: any) => market.id).join('&productIds=')}`)).data;

    const results = tradeData.reduce((acc: { volume: number, openInterest: number }, market: any) => {
        const price = + ((marketPrice.find((priceEntry: any) => market.id === priceEntry.productId))?.oraclePrice || 0);
        acc.volume += price * +(market.volume24h || 0);
        acc.openInterest += price * +(market.openInterest || 0);
        return acc;
    }, { volume: 0, openInterest: 0 });

    return {
        dailyVolume: results.volume,
        openInterestAtEnd: results.openInterest,
    }
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.ETHEREUM],
    fetch,
    runAtCurrTime: true
}

export default adapter;