import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const openInterestEndpoint = "https://pro.edgex.exchange/api/v1/public/quote/getTicketSummary?period=LAST_DAY_1"

const fetch = async (_a: any, _b: any, _c: FetchOptions) => {
    const openInterest = await fetchURL(openInterestEndpoint);
    const openInterestAtEnd = openInterest.data.tickerSummary.openInterest;
    return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
    version: 1,
    chains: [CHAIN.EDGEX],
    fetch,
    start: "2024-08-06",
    runAtCurrTime: true,
}

export default adapter;