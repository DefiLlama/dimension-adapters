import { Adapter, FetchOptions } from "../adapters/types";
import { METRIC } from "./metrics";
import { findClosest } from "./utils/findClosest"
import fetchURL, { httpGet } from "../utils/fetchURL";

const PYTH_1M_TBILL_YIELD_URL = "https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=0x60076f4fc0dfd634a88b5c3f41e7f8af80b403ca365442b81e582ceb8fc421a2";

export function buildStablecoinAdapter(chain: string, stablecoinId: string, daysBetweenAttestations: number, attestations: {
    time: string, // time of report
    circulation: number, // billions of USDC in circulation
    allocated: number, // billions in tbills + repos + money market funds (DON'T INCLUDE CASH!)
    tbillRate: number // % interest earned in treasury bills
}[]) {
    const adapter: Adapter = {
        version: 2,
        adapter: {
            [chain]: {
                fetch: async ({ fromTimestamp, createBalances }: FetchOptions) => {
                    const dailyFees = createBalances()

                    const stablecoinData = await httpGet(`https://stablecoins.llama.fi/stablecoin/${stablecoinId}`)

                    const supply = (findClosest(fromTimestamp, stablecoinData.tokens.map((d: any) => ({ ...d, time: d.date * 1e3 })), 1.5 * 24 * 3600) as any).circulating.peggedUSD

                    const closestAttestation = findClosest(fromTimestamp, attestations)
                    if (new Date(closestAttestation.time).getTime() - 1.2 * daysBetweenAttestations * 24 * 3600e3 > fromTimestamp * 1e3) {
                        throw new Error("Trying to refill with no attestations, pls add attestations")
                    }

                    const pythResponse = await fetchURL(PYTH_1M_TBILL_YIELD_URL);
                    const latestApy = pythResponse?.parsed[0]?.price?.price;
                    const tbillRate = latestApy ? latestApy/1e8 : closestAttestation.tbillRate;

                    const tbills = supply * closestAttestation.allocated / closestAttestation.circulation
                    const annualYield = tbills * tbillRate/100;
                    dailyFees.addUSDValue(annualYield / 365, METRIC.ASSETS_YIELDS)

                    return {
                        dailyFees,
                        dailyRevenue: dailyFees,
                        dailyProtocolRevenue: dailyFees,
                    }
                },
            }
        }
    }

    return adapter
}
