import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_BASE = "https://app.perptools.ai/api";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
    const url = `${API_BASE}/v1/oi/daily?date=${options.dateString}`;
    const data = await fetchURL(url);

    if (isNaN(data.open_interest_usd) || data.open_interest_usd < 0) {
        throw new Error(`Invalid open interest from API: ${data.open_interest_usd} for date ${options.dateString}`);
    }

    return {
        openInterestAtEnd: data.open_interest_usd,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.ORDERLY],
    start: "2026-02-21", // Perptools/Orderly launch
};

export default adapter;
