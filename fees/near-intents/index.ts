import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * Previous source : (internal server error)
 * NEAR Intents Fees Adapter for DefiLlama
 * 
 * Data Source: https://platform.data.defuse.org/api/public/fees
 * Swagger UI: https://platform.data.defuse.org/swagger-ui/#/public/get_fees
 * 
 * Returns daily fee data aggregated by the NEAR Intents platform
 * 
 * New source: https://revenue.near.org/
 */


let feeData: any
let revenueData: any

const fetch = async (_: any, _1: any, options: FetchOptions) => {
    const { dateString, createBalances } = options;

    const dailyFees = createBalances();
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = createBalances();

    if (!feeData)
        feeData = fetchURL("https://revenue.near.org/api/total-fees")
    if (!revenueData)
        revenueData = fetchURL("https://revenue.near.org/api/revenue")
    // Fetch fee data for the specific period using query parameters
    const feeResponse = await feeData
    const revenueResponse = await revenueData

    if (!feeResponse || !feeResponse.rows || !Array.isArray(feeResponse.rows) || !revenueResponse || !revenueResponse.rows || !Array.isArray(revenueResponse.rows))
        throw new Error("Invalid API response format");
    const feeItem = feeResponse.rows.find(feeEntry => feeEntry.dt === dateString);
    const revenueItem = revenueResponse.rows.find(revenueEntry => revenueEntry.dt === dateString);
    if (!feeItem)
        throw new Error(`No fee data found for date: ${dateString}`);

    const { fees_usd, near_price_usd } = feeItem
    const { daily_near } = revenueItem || { daily_near: 0 } //empty revenue entries are not included in the response
    const revenue_usd = daily_near * near_price_usd;
    dailyFees.addUSDValue(fees_usd);
    dailyRevenue.addUSDValue(revenue_usd);
    dailySupplySideRevenue.addUSDValue(fees_usd - revenue_usd);

    return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
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
        SupplySideRevenue: "Part of fees recieved by NEAR Intents' partners.",
        Revenue: "Revenue collected by NEAR Intents platform.",
        ProtocolRevenue: "All the revenue goes to the protocol treasury."
    },
};

export default adapter;
