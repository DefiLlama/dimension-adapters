import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const MARKETS_API = "https://api.rise.trade/v1/markets";

const fetch = async (_: any, __: any, _options: FetchOptions) => {
    const response = await fetchURL(MARKETS_API);
    const markets = response.data?.markets;

    if (!markets?.length) {
        throw new Error("RiseX markets data missing");
    }

    const openInterestAtEnd = markets.reduce((total: number, market: any) => {
        if (!market.available) return total;
        return total + Number(market.open_interest) * Number(market.mark_price);
    }, 0);

    return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.RISE],
    runAtCurrTime: true,
};

export default adapter;
