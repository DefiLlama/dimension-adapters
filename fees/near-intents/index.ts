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

const fetch = async (_: any, _1: any, options: FetchOptions) => {
    const { dateString, createBalances } = options;

    const dailyFees = createBalances();

    // Fetch fee data for the specific period using query parameters
    const response: APIResponse = await fetchURL(
        `https://platform.data.defuse.org/api/public/fees?start=${dateString}&end=${dateString}`
    );

    if (!response || !response.fees || !Array.isArray(response.fees) || response.fees.length !== 1)
        throw new Error("Invalid API response format");

    dailyFees.addUSDValue(response.fees[0].fee);
    return {
        dailyFees,
    };
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
