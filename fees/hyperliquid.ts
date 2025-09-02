import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, } from '../adapters/types';
import { findClosest } from "../helpers/utils/findClosest";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const data: any[] = (await httpGet(`https://api.hypurrscan.io/fees`)).map((t: any) => ({ ...t, time: t.time * 1e3 }))

    const startCumFees: any = findClosest(options.startTimestamp, data, 3600)
    const endCumFees: any = findClosest(options.endTimestamp, data, 3600)
    dailyFees.addCGToken("usd-coin", (endCumFees.total_fees - startCumFees.total_fees)/1e6)

    // https://hyperdash.info/statistics
    // 97% of fees go to Assistance Fund for burning tokens, remaining 3% go to HLP Vault before 30th august 2025
    // 99% of fees go to Assistance Fund for burning tokens, remaining 1% go to HLP Vault after 30th august 2025

    const dailyHoldersRevenue = dailyFees.clone();
    if(options.startOfDay < new Date('2025-08-30').getTime() / 1000) {
        dailyHoldersRevenue.resizeBy(0.97);
    } else {
        dailyHoldersRevenue.resizeBy(0.99);
    }

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyHoldersRevenue,
        dailyProtocolRevenue: '0',
        dailyHoldersRevenue: dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "Trade fees and Ticker auction proceeds. Note this excludes the HLP vault and HyperEVM fees.",
    Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, remaining 1% go to HLP Vault",
    ProtocolRevenue: "Protocol doesn't keep any fees.",
    HoldersRevenue: "99% of fees go to Assistance Fund for burning tokens, remaining 1% go to HLP Vault",
}

const adapter: Adapter = {
    version: 2,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    methodology,
}

export default adapter
