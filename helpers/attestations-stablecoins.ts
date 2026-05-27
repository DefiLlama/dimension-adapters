import { Adapter, FetchOptions } from "../adapters/types";
import { METRIC } from "./metrics";
import { findClosest } from "./utils/findClosest"
import fetchURL, { httpGet } from "../utils/fetchURL";
import { getEnv } from "./env";

const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

export function buildStablecoinAdapter(chain: string, stablecoinId: string, daysBetweenAttestations: number, attestations: {
    time: string, // time of report
    circulation: number, // billions of USDC in circulation
    allocated: number, // billions in tbills + repos + money market funds (DON'T INCLUDE CASH!)
    tbillRate: number // % interest earned in treasury bills
}[]) {
    const adapter: Adapter = {
        version: 1,
        adapter: {
            [chain]: {
                fetch: async (_a: any, _b: any, options: FetchOptions) => {
                    const dailyFees = options.createBalances()

                    const FRED_API_KEY = getEnv("FRED_API_KEY");

                    if (!FRED_API_KEY) {
                        throw new Error("FRED_API_KEY is not set");
                    }

                    const stablecoinData = await httpGet(`https://stablecoins.llama.fi/stablecoin/${stablecoinId}`)

                    const supply = (findClosest(options.fromTimestamp, stablecoinData.tokens.map((d: any) => ({ ...d, time: d.date * 1e3 })), 1.5 * 24 * 3600) as any).circulating.peggedUSD

                    const closestAttestation = findClosest(options.fromTimestamp, attestations)
                    if (new Date(closestAttestation.time).getTime() - 1.2 * daysBetweenAttestations * 24 * 3600e3 > options.fromTimestamp * 1e3) {
                        throw new Error("Trying to refill with no attestations, pls add attestations")
                    }

                    const oneMonthAgo = new Date((options.fromTimestamp * 1000) - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                    const tbillYieldData = await fetchURL(`https://api.stlouisfed.org/fred/series/observations?series_id=DTB3&observation_start=${oneMonthAgo}&observation_end=${options.dateString}&api_key=${FRED_API_KEY}&file_type=json`)
                    const latestObservation = tbillYieldData.observations.findLast((obs: any) => obs.value !== '.');

                    if (!latestObservation) {
                        throw new Error("No valid tbill yield data found");
                    }

                    const tbillYield = Number(latestObservation.value);

                    const tbills = supply * closestAttestation.allocated / closestAttestation.circulation

                    const yieldForPeriod = tbills * tbillYield * (options.toTimestamp - options.fromTimestamp) / (ONE_YEAR_IN_SECONDS * 100)
                    dailyFees.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS)

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
