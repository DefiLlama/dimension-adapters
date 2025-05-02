import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, } from '../adapters/types';
import { findClosest } from "../helpers/utils/findClosest";
import { httpGet } from "../utils/fetchURL";

const fetchFees = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const data: any[] = (await httpGet(`https://api.hypurrscan.io/fees`)).map((t: any) => ({ ...t, time: t.time * 1e3 }))

    const startCumFees: any = findClosest(options.startTimestamp, data, 3600)
    const endCumFees: any = findClosest(options.endTimestamp, data, 3600)
    dailyFees.addCGToken("usd-coin", (endCumFees.total_fees - startCumFees.total_fees)/1e6)

    const totalFees = options.createBalances();
    totalFees.addCGToken("usd-coin", endCumFees.total_fees/1e6)

    // https://hyperdash.info/statistics
    // 93% of fees go to Assitant Fund for burning tokens, remaining 7% go to HLP Vault

    const dailyHoldersRevenue = dailyFees.clone();
    const totalHoldersRevenue = totalFees.clone();
    dailyHoldersRevenue.resizeBy(0.93);
    totalHoldersRevenue.resizeBy(0.93);

    return {
        dailyFees,
        dailyRevenue: dailyHoldersRevenue,
        dailyUserFees: dailyFees,
        dailyHoldersRevenue: dailyHoldersRevenue,
        totalFees,
        totalRevenue: totalHoldersRevenue,
        totalUserFees: totalFees,
        totalHoldersRevenue: totalHoldersRevenue,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch: fetchFees,
            meta: {
                methodology: {
                    Fees: "Trade fees and Ticker auction proceeds. Note this excludes the HLP vault and HyperEVM fees.",
                    HoldersRevenue: "93% of fees go to Assitant Fund for burning tokens, remaining 7% go to HLP Vault",
                }
            }
        },
    },
}
export default adapter
