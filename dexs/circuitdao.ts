/**
 * DefiLlama fees/revenue adapter for Circuit protocol.
 *
 * Place this file at fees/circuitdao.ts in the DefiLlama/dimension-adapters repo.
 *
 * Fees:    Stability fees paid by BYC borrowers + liquidation penalties collected.
 * Revenue: Fees received by the protocol net of interest paid to savings vault depositors and bad debt principal recovered.
 * SupplySideRevenue: Interest paid out to BYC savings vault depositors.
 *
 * Data source: https://api.circuitdao.com/protocol/stats
 * All BYC amounts in the API are in mBYC (milli-BYC). 1 BYC = 1000 mBYC = 1 USD.
 *
 * The values reported here can be independently verified by running the Circuit block scanner:
 * https://github.com/circuitdao/circuit-analytics
 */

import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const STATS_API = "https://api.circuitdao.com/protocol/stats";
const MCAT = 1000; // 1 BYC = 1000 mBYC; BYC is pegged 1:1 to USD

const LABELS = {
    ProtocolFees: "Stability Fees & Liquidation Penalties",
    ProtocolFeesToTreasury: "Stability Fees & Liquidation Penalties To Treasury",
    SavingsInterestToDepositors: "Savings Interest To Depositors",
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    // Fetch 3 days of daily-bucketed data ending at the target timestamp.
    // This ensures we always have at least two consecutive daily entries to diff.
    const start = new Date((options.endTimestamp - 3 * 86400) * 1000).toISOString();
    const end = new Date(options.endTimestamp * 1000).toISOString();
    const url = `${STATS_API}?sample_interval=1d&start_date=${start}&end_date=${end}`

    const data = await fetchURL(url);

    const stats: any[] = data?.stats ?? [];
    if (stats.length < 2) {
        throw new Error(`Insufficient data points for date ${options.dateString}`);
    }

    // stats entries contain cumulative running totals; diff last two to get the day's delta
    const latest = stats[stats.length - 1];
    const prev = stats[stats.length - 2];

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    // fees_received and interest_paid are cumulative totals in mBYC
    const feesUsd = (latest.fees_received - prev.fees_received) / MCAT;
    const supplySideUsd = (latest.interest_paid - prev.interest_paid) / MCAT;

    const dailyProtocolRevenue = options.createBalances();
    dailySupplySideRevenue.addUSDValue(supplySideUsd, LABELS.SavingsInterestToDepositors);
    // revenue is derived from the accounting identity: dailyFees - dailySupplySideRevenue
    dailyRevenue.addUSDValue(feesUsd - supplySideUsd, LABELS.ProtocolFeesToTreasury);
    // all revenue goes to treasury (no token holder split)
    dailyProtocolRevenue.addUSDValue(feesUsd - supplySideUsd, LABELS.ProtocolFeesToTreasury);

    dailyFees.addUSDValue(supplySideUsd, LABELS.SavingsInterestToDepositors);
    dailyFees.addUSDValue(feesUsd - supplySideUsd, LABELS.ProtocolFees);

    return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
    fetch,
    start: "2026-01-07",
    allowNegativeValue: true,
    chains: [CHAIN.CHIA],
    methodology: {
        Fees: "Stability fees (interest) and liquidation penalties paid into treasury",
        Revenue: "Fees net of SupplySideRevenue",
        ProtocolRevenue: "All revenue accrues to the protocol treasury (no token holder split)",
        SupplySideRevenue: "Interest paid to savings vault depositors",
    },
    breakdownMethodology: {
        Fees: {
            [LABELS.ProtocolFees]: "Stability fees charged on BYC loans and liquidation penalties collected",
            [LABELS.SavingsInterestToDepositors]: "Interest paid to savings vault depositors",
        },
        Revenue: {
            [LABELS.ProtocolFeesToTreasury]: "Stability fees and liquidation penalties retained by treasury after savings interest payouts",
        },
        ProtocolRevenue: {
            [LABELS.ProtocolFeesToTreasury]: "All protocol revenue accrues to the treasury",
        },
        SupplySideRevenue: {
            [LABELS.SavingsInterestToDepositors]: "Interest paid to BYC savings vault depositors",
        },
    },
};

export default adapter;