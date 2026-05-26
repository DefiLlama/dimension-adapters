import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * NEAR Intents Fees Adapter for DefiLlama
 *
 * Data sources (revenue.near.org):
 *   /api/total-fees     — gross fees across NEAR Protocol + NEAR Intents + integration partners
 *                         (per the dashboard's own tooltip; daily_fees_near is ecosystem-wide)
 *   /api/protocol-fees  — NEAR L1 gas burned, ALREADY tracked separately by fees/near/index.ts
 *   /api/revenue        — NEAR/wNEAR received by the intents fee wallets (fefundsadmin,
 *                         1csfundsadmin, buybacks); matches Dune query 6732575's
 *                         intents_revenue_near to the cent
 *
 * To avoid double-counting the L1 portion with fees/near/index.ts, we subtract
 * daily_protocol_fee_near from daily_fees_near before booking dailyFees. The L1 endpoint
 * stabilised on 2025-09-01 (zero days of total < L1 across the next 266 days); pre-Sep
 * 2025 the /api/total-fees stream was incomplete on the upstream side, so the adapter
 * starts from the first reliably-complete day.
 */


let feeData: any
let revenueData: any
let protocolFeeData: any

const fetch = async (_: any, _1: any, options: FetchOptions) => {
    const { dateString, createBalances } = options;

    const dailyFees = createBalances();
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = createBalances();

    if (!feeData)
        feeData = fetchURL("https://revenue.near.org/api/total-fees")
    if (!revenueData)
        revenueData = fetchURL("https://revenue.near.org/api/revenue")
    if (!protocolFeeData)
        protocolFeeData = fetchURL("https://revenue.near.org/api/protocol-fees")
    const feeResponse = await feeData
    const revenueResponse = await revenueData
    const protocolFeeResponse = await protocolFeeData

    if (!feeResponse || !feeResponse.rows || !Array.isArray(feeResponse.rows)
        || !revenueResponse || !revenueResponse.rows || !Array.isArray(revenueResponse.rows)
        || !protocolFeeResponse || !protocolFeeResponse.rows || !Array.isArray(protocolFeeResponse.rows))
        throw new Error("Invalid API response format");
    const feeItem = feeResponse.rows.find(feeEntry => feeEntry.dt === dateString);
    const revenueItem = revenueResponse.rows.find(revenueEntry => revenueEntry.dt === dateString);
    const protocolFeeItem = protocolFeeResponse.rows.find(entry => entry.dt === dateString);
    if (!feeItem)
        throw new Error(`No fee data found for date: ${dateString}`);

    const { daily_fees_near, near_price_usd } = feeItem
    const { daily_near } = revenueItem || { daily_near: 0 } //empty revenue entries are not included in the response
    const { daily_protocol_fee_near } = protocolFeeItem || { daily_protocol_fee_near: 0 }

    // Subtract the L1 protocol-fee component already tracked by fees/near/index.ts so
    // intents-protocol fees aren't double-counted on the NEAR chain overview.
    const intents_fees_near = daily_fees_near - daily_protocol_fee_near;
    const intents_fees_usd = intents_fees_near * near_price_usd;
    const revenue_usd = daily_near * near_price_usd;

    dailyFees.addUSDValue(intents_fees_usd);
    dailyRevenue.addUSDValue(revenue_usd);
    dailySupplySideRevenue.addUSDValue(intents_fees_usd - revenue_usd);

    return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
    version: 1,
    start: '2025-09-01', // /api/total-fees stream complete from here; pre-Sep daily_fees_near < daily_protocol_fee_near
    adapter: {
        [CHAIN.NEAR]: {
            fetch: fetch,
        },
    },
    methodology: {
        Fees: "Total fees collected by NEAR Intents and integration partners, sourced from revenue.near.org/api/total-fees minus revenue.near.org/api/protocol-fees so the NEAR L1 gas component already reported by the Near chain adapter is not double-counted.",
        SupplySideRevenue: "Part of fees recieved by NEAR Intents' partners.",
        Revenue: "NEAR received by NEAR Intents fee wallets (fefundsadmin + 1csfundsadmin + buybacks), valued in USD at the daily NEAR price.",
        ProtocolRevenue: "All the revenue goes to the protocol treasury."
    },
};

export default adapter;
