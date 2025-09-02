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
    // 93% of fees go to Assistance Fund for burning tokens, remaining 7% go to HLP Vault

    const dailyHoldersRevenue = dailyFees.clone(0.93);
    const dailySupplySideRevenue = dailyFees.clone(0.07);

    return {
        dailyFees,
        dailyRevenue: dailyHoldersRevenue,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue: dailySupplySideRevenue,
        dailyHoldersRevenue: dailyHoldersRevenue,
        dailyProtocolRevenue: 0,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
        },
    },
    methodology: {
        Fees: "Trade fees and Ticker auction proceeds. Note this excludes the HLP vault and HyperEVM fees.",
        Revenue: "93% of fees go to Assistance Fund for burning tokens",
        SupplySideRevenue: "7% of fees go to HLP Vault suppliers",
        HoldersRevenue: "93% of fees go to Assistance Fund for burning tokens",
        ProtocolRevenue: "No protocol revenue",
    }
}
export default adapter
