import { Adapter, FetchOptions } from "../../adapters/types";

export function buildStablecoinAdapter(tokenAddress: string, attestations: {
    time: string, // time of report
    circulation: number, // billions of USDC in circulation
    allocated: number, // billions in tbills + repos + money market funds (DON'T INCLUDE CASH!)
    tbillRate: number // % interest earned in treasury bills
}[]) {
    const adapter: Adapter = {
        version: 2,
        adapter: {
            ethereum: {
                fetch: async ({ fromTimestamp, createBalances, fromApi }: FetchOptions) => {
                    const dailyFees = createBalances()

                    const supply = await fromApi.call({ target: tokenAddress, abi: "erc20:totalSupply" })

                    const closestAttestation = attestations.reduce((closest, att) => {
                        if (Math.abs(new Date(att.time).getTime() - fromTimestamp * 1e3) < Math.abs(new Date(closest.time).getTime() - fromTimestamp * 1e3)) {
                            return att
                        }
                        return closest
                    })
                    if (new Date(closestAttestation.time).getTime() > fromTimestamp * 1e3 - 30 * 24 * 3600e3) {
                        throw new Error("Trying to refill with no attestations, pls add attestations")
                    }

                    const tbills = supply * closestAttestation.allocated / closestAttestation.circulation
                    const annualYield = tbills * closestAttestation.tbillRate / 100 // yield in repos (SOFR) and yield in tbills is almost the same
                    dailyFees.add(tokenAddress, annualYield / 365)

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