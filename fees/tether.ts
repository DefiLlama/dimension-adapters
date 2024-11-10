import { Adapter, FetchOptions } from "../adapters/types";

const adapter: Adapter = {
    version: 2,
    adapter: {
        ethereum: {
            fetch: async ({ fromTimestamp, createBalances }: FetchOptions) => {
                const dailyFees = createBalances()
                
                // Based on https://tether.to/en/transparency/?tab=reports
                if(fromTimestamp > 1719709261){
                    let annualYield = 0
                    // per the last report, there's:
                    annualYield += 80948e6*5.287/100 // 80.9bn in treasury bills with a maturity of less tham 90d, so picking the lowest yield between 1/2/3 mo treasurys
                    annualYield += 11.2e9*5.35/100 // 11.2bn in repos, which should be earning SOFR
                    dailyFees.addCGToken("tether", annualYield/365)
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