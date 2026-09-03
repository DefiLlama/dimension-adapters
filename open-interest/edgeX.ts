import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const openInterestEndpoint = "https://pro.edgex.exchange/api/v1/public/quote/getTicketSummary?period=LAST_DAY_1"

const fetch = async (_options: FetchOptions) => {
    const openInterest = await fetchURL(openInterestEndpoint);
    const openInterestAtEnd = openInterest.data.tickerSummary.openInterest;
    return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
    version: 1,
    chains: [CHAIN.EDGEX],
    fetch,
    start: "2024-08-06",
    //runAtCurrTime: true,
    // The v1 host now serves v2's exchange-wide figure, so this leg duplicates open-interest/edgex-v2.
    // Same cause and same date as the v1 fee leg, stopped in #9109.
    //deadFrom: "2026-08-15",
}

export default adapter;