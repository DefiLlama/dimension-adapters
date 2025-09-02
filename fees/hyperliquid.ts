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
        Revenue: "97% of fees go to Assistance Fund for burning tokens, it was 99% after network upgrade on 30 Aug, 2025",
        SupplySideRevenue: "3% of fees go to HLP Vault suppliers, it was 1% after network upgrade on 30 Aug, 2025",
        HoldersRevenue: "97% of fees go to Assistance Fund for burning tokens, it was 99% after network upgrade on 30 Aug, 2025",
        ProtocolRevenue: "No protocol revenue",
    }
}
export default adapter
