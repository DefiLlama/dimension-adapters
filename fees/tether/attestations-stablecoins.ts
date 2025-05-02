import { Adapter, FetchOptions } from "../../adapters/types";
import { findClosest } from "../../helpers/utils/findClosest"
import { httpGet } from "../../utils/fetchURL";

export function buildStablecoinAdapter(stablecoinId: string, daysBetweenAttestations:number, attestations: {
    time: string, // time of report
    circulation: number, // billions of USDC in circulation
    allocated: number, // billions in tbills + repos + money market funds (DON'T INCLUDE CASH!)
    tbillRate: number // % interest earned in treasury bills
}[]) {
    const adapter: Adapter = {
        version: 2,
        adapter: {
            ethereum: {
                fetch: async ({ fromTimestamp, createBalances }: FetchOptions) => {
                    const dailyFees = createBalances()

                    const stablecoinData = await httpGet(`https://stablecoins.llama.fi/stablecoin/${stablecoinId}`)

                    const supply = (findClosest(fromTimestamp, stablecoinData.tokens.map((d: any)=>({...d, time: d.date*1e3})), 1.5 * 24 * 3600) as any).circulating.peggedUSD

                    const closestAttestation = findClosest(fromTimestamp, attestations)
                    if (new Date(closestAttestation.time).getTime() - 1.2 * daysBetweenAttestations * 24 * 3600e3 > fromTimestamp * 1e3) {
                        throw new Error("Trying to refill with no attestations, pls add attestations")
                    }

                    const tbills = supply * closestAttestation.allocated / closestAttestation.circulation
                    const annualYield = tbills * closestAttestation.tbillRate / 100 // yield in repos (SOFR) and yield in tbills is almost the same
                    const decimals = 1e6 // assuming 6 decimals
                    dailyFees.add(stablecoinData.address, decimals * annualYield / 365)

                    return {
                        dailyFees,
                        dailyRevenue: dailyFees
                    }
                },
            }
        }
    }

    return adapter
}
