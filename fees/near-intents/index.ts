import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * NEAR Intents Fees Adapter for DefiLlama
 * 
 * Data Source: https://platform.data.defuse.org/api/public/fees
 * Swagger UI: https://platform.data.defuse.org/swagger-ui/#/public/get_fees
 * 
 * Returns daily fee data aggregated by the NEAR Intents platform
 */

const feeSwitchDate = 1771804799

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
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = createBalances();

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
    if (options.startTimestamp >= feeSwitchDate) {
        dailySupplySideRevenue.addUSDValue(item.fee / 2)
        dailyRevenue.addUSDValue(item.fee / 2)
    }
    else {
        dailySupplySideRevenue.addUSDValue(item.fee)
    }
    return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue};
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
        SupplySideRevenue: "Distribution fees set by NEAR Intents partners, split 50/50 with the protocol since 2026-02-23",
        Revenue: "The protocol collects half of the distribution fees since 2026-02-23",
        ProtocolRevenue: "The protocol collects half of the distribution fees since 2026-02-23"
    },
};

export default adapter;
