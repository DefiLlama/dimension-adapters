import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, } from '../adapters/types';
import { findClosest } from "../helpers/utils/findClosest";
import { httpGet } from "../utils/fetchURL";

// fees source: https://hyperdash.info/statistics
const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const data: any[] = (await httpGet(`https://api.hypurrscan.io/fees`)).map((t: any) => ({ ...t, time: t.time * 1e3 }))

    const startCumFees: any = findClosest(options.startTimestamp, data, 3600)
    const endCumFees: any = findClosest(options.endTimestamp, data, 3600)
    dailyFees.addCGToken("usd-coin", (endCumFees.total_fees - startCumFees.total_fees)/1e6)


    // confirm from hyperliquid team
    // before 30 Aug, 97% of fees go to Assistance Fund for burning tokens, remaining 3% go to HLP Vault
    // after 30 Aug, 99% of fees go to Assistance Fund for burning tokens, remaining 1% go to HLP Vault
    const dailyHoldersRevenue = dailyFees.clone(options.startTimestamp >= 1756512000 ? 0.99 : 0.97);
    const dailySupplySideRevenue = dailyFees.clone(options.startTimestamp >= 1756512000 ? 0.01 : 0.03);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue: dailySupplySideRevenue,
        dailyRevenue: dailyHoldersRevenue,
        dailyHoldersRevenue: dailyHoldersRevenue,
        dailyProtocolRevenue: 0,
    }
}

const methodology = {
    Fees: "Trade fees and Ticker auction proceeds. Note this excludes the HLP vault and HyperEVM fees.",
    Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, before 30 Aug 2025 it was 97% of fees",
    ProtocolRevenue: "Protocol doesn't keep any fees.",
    HoldersRevenue: "99% of fees go to Assistance Fund for bbuying HYPE tokens, before 30 Aug 2025 it was 97% of fees",
    SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3%",
}

const adapter: Adapter = {
    version: 2,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    methodology,
}

export default adapter
