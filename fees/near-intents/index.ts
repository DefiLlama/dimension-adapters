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

const fetch = async (options: FetchOptions) => {
    const { startTimestamp, endTimestamp, dateString, createBalances } = options;

    const dailyFees = createBalances();

    // Convert Unix timestamp to UTC date string (YYYY-MM-DD)
    const startDate = new Date(startTimestamp * 1000).toISOString().split('T')[0];
    const endDate = new Date(endTimestamp * 1000).toISOString().split('T')[0];

    // Fetch fee data for the specific period using query parameters
    const response: APIResponse = await fetchURL(
        `https://platform.data.defuse.org/api/public/fees?start=${startDate}&end=${endDate}`
    );

    if (!response || !response.fees || !Array.isArray(response.fees)) {
        throw new Error("Invalid API response format");
    }

    // Find the fee data
    const dayData = response.fees.find((item: FeeData) => item.date_at === dateString);

    if (dayData && dayData.fee > 0) {
        dailyFees.addUSDValue(dayData.fee);
    }
    // Note: If no data found, we return empty balances (0 values)
    // This is normal for dates where data hasn't been aggregated yet
    return {
        dailyFees,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.NEAR]: {
            fetch: fetch,
            start: '2025-05-06', // First date with data in the API
        },
    },
    methodology: {
        Fees: "Total fees collected by NEAR Intents platform.",
    },
};

export default adapter;
