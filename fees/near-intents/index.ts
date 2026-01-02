import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * NEAR Intents Fees Adapter for DefiLlama
 * 
 * Data Source: https://platform.data.defuse.org/api/public/fees
 * Swagger UI: https://platform.data.defuse.org//swagger-ui/#/public/get_fees
 * 
 * Returns daily fee data aggregated by the NEAR Intents platform
 */

interface FeeData {
    fee: number;
    date_at: string; // Format: "YYYY-MM-DD"
}

interface APIResponse {
    fees: FeeData[];
}

let data: any

const fetch = async (_: any, _1: any, options: FetchOptions) => {
    const { dateString, createBalances } = options;

    const dailyFees = createBalances();

    if (!data)
        data = fetchURL("https://platform.data.defuse.org/api/public/fees")
    // Fetch fee data for the specific period using query parameters
    const response: APIResponse = await data

    if (!response || !response.fees || !Array.isArray(response.fees))
        throw new Error("Invalid API response format");
    const item = response.fees.find(feeEntry => feeEntry.date_at === dateString);
    if (!item)
        throw new Error(`No fee data found for date: ${dateString}`);

    dailyFees.addUSDValue(item.fee);
    return { dailyFees, };
};

const adapter: SimpleAdapter = {
    version: 1,
    start: '2025-05-06', // First date with data in the API
    adapter: {
        [CHAIN.NEAR]: {
            fetch: fetch,
        },
    },
    methodology: {
        Fees: "Total fees collected by NEAR Intents platform.",
    },
};

export default adapter;
