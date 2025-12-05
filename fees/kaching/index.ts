import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import ADDRESSES from "../../helpers/coreAssets.json";
const BASE_API_URL = "https://api.kaching.vip";

const fetch = async (options: FetchOptions) => { 
    const dailyFees = options.createBalances();
    
    const timestamp = options.endTimestamp || Math.floor(Date.now() / 1000);
    const revenueResponse = await httpGet(`${BASE_API_URL}/transactions/revenue?timestamp=${timestamp}`);
    
    if (revenueResponse?.today?.revenue) {
        // Revenue is in USDC, convert to chain amount (6 decimals)
        const revenueInChainAmount = Math.floor(revenueResponse.today.revenue * 1000000);
        dailyFees.add((ADDRESSES as any).aptos.USDC_3, revenueInChainAmount.toString());
    }
    
    return {
        dailyFees,
        dailyRevenue: dailyFees,
    };
}

const methodology = {
    Fees: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform",
    Revenue: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform"
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.APTOS],
    start: 1762819200, // 2025-11-11
    methodology,
};

export default adapter;