import adapters from './hyperliquid'
const { breakdown, ...rest } = adapters
import { METRIC } from "../helpers/metrics";

const breakdownMethodology = {
    Fees: {
        'Trade Fees': 'Perp trade fees and Ticker auction proceeds',
    },
    HoldersRevenue: {
        [METRIC.TOKEN_BUY_BACK]: "All the revenue is used for buying back HYPE tokens"
    },
}

const methodology = {
    Fees: "Trade fees and Ticker auction proceeds. Note this excludes HyperEVM fees.",
    Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, before 30 Aug 2025 it was 97% of fees",
    ProtocolRevenue: "Protocol doesn't keep any fees.",
    HoldersRevenue: "99% of fees go to Assistance Fund for bbuying HYPE tokens, before 30 Aug 2025 it was 97% of fees",
}
export default {
    ...rest,
    methodology,
    breakdownMethodology,
    adapter: breakdown["perp"],
}