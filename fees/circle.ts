import { Adapter, FetchOptions } from "../adapters/types";

const adapter: Adapter = {
    version: 2,
    adapter: {
        ethereum: {
            fetch: async ({ fromTimestamp, createBalances }: FetchOptions) => {
                const dailyFees = createBalances()
                
                // Based on https://www.circle.com/en/transparency
                if(fromTimestamp > 1719709261){
                    let annualYield = 0
                    // per the last report, there's:
                    annualYield += 11.2e9*5.287/100 // 11.2bn in tbills
                    annualYield += 17.1e9*5.35/100 // in repos, which should be earning SOFR
                    dailyFees.addCGToken("usd-coin", annualYield/365)
                }
                
                return {
                    dailyFees,
                    dailyRevenue: dailyFees
                }
            },
        }
    }
}

export default adapter;