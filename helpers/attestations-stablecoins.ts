import { Adapter, FetchOptions } from "../adapters/types";
import { METRIC } from "./metrics";
import { findClosest } from "./utils/findClosest"
import fetchURL, { httpGet } from "../utils/fetchURL";
import { getEnv } from "./env";

const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

type YahooPricePoint = { timestamp: number, adjclose: number }

async function fetchYahooAdjClose(symbol: string, period1: number, period2: number): Promise<YahooPricePoint[]> {
    const data = await fetchURL(`${YAHOO_CHART_URL}/${symbol}?period1=${period1}&period2=${period2}&interval=1d`)
    const result = data.chart?.result?.[0]
    if (!result?.timestamp?.length) {
        throw new Error(`No Yahoo chart data for ${symbol}`)
    }

    const adjcloses: (number | null)[] = result.indicators.adjclose[0].adjclose
    return result.timestamp
        .map((timestamp: number, i: number) => ({ timestamp, adjclose: adjcloses[i] }))
        .filter((point: { adjclose: number | null }) => point.adjclose != null) as YahooPricePoint[]
}

function getAdjCloseAtTimestamp(prices: YahooPricePoint[], targetTimestamp: number): number {
    const closest = prices.reduce((closest, point) =>
        Math.abs(point.timestamp - targetTimestamp) < Math.abs(closest.timestamp - targetTimestamp) ? point : closest
    )
    return closest.adjclose
}

function getAssetPnl(
    usdAllocation: number,
    attestationTimestamp: number,
    fromTimestamp: number,
    toTimestamp: number,
    prices: YahooPricePoint[],
): number {
    const attestationPrice = getAdjCloseAtTimestamp(prices, attestationTimestamp)
    const units = usdAllocation / attestationPrice
    const startPrice = getAdjCloseAtTimestamp(prices, fromTimestamp)
    const endPrice = getAdjCloseAtTimestamp(prices, toTimestamp)
    return units * (endPrice - startPrice)
}

export function buildStablecoinAdapter(chain: string, stablecoinId: string, daysBetweenAttestations: number, attestations: {
    time: string, // time of report
    circulation: number, // billions of USDC in circulation
    allocated: number, // billions in tbills + repos + money market funds (DON'T INCLUDE CASH!)
    tbillRate?: number // % interest earned in treasury bills
    allocatedToGold?: number // billion dollars allocated to gold
    allocatedToBitcoin?: number // billion dollars allocated to bitcoin
}[]) {
    const adapter: Adapter = {
        version: 1,
        adapter: {
            [chain]: {
                fetch: async (options: FetchOptions) => {
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

                    const attestationTimestamp = new Date(closestAttestation.time).getTime() / 1e3
                    const hasGoldAllocation = closestAttestation.allocatedToGold != null && closestAttestation.allocatedToGold > 0
                    const hasBtcAllocation = closestAttestation.allocatedToBitcoin != null && closestAttestation.allocatedToBitcoin > 0

                    if (hasGoldAllocation || hasBtcAllocation) {
                        const period1 = attestationTimestamp
                        const period2 = options.toTimestamp + ONE_DAY_IN_SECONDS

                        const [goldPrices, btcPrices] = await Promise.all([
                            hasGoldAllocation ? fetchYahooAdjClose("GC=F", period1, period2) : Promise.resolve([]),
                            hasBtcAllocation ? fetchYahooAdjClose("BTC=F", period1, period2) : Promise.resolve([]),
                        ])

                        if (hasGoldAllocation) {
                            const goldUsd = supply * closestAttestation.allocatedToGold! / closestAttestation.circulation
                            const goldPnl = getAssetPnl(goldUsd, attestationTimestamp, options.fromTimestamp, options.toTimestamp, goldPrices)
                            dailyFees.addUSDValue(goldPnl, 'Gold Price PnL')
                        }

                        if (hasBtcAllocation) {
                            const btcUsd = supply * closestAttestation.allocatedToBitcoin! / closestAttestation.circulation
                            const btcPnl = getAssetPnl(btcUsd, attestationTimestamp, options.fromTimestamp, options.toTimestamp, btcPrices)
                            dailyFees.addUSDValue(btcPnl, 'Bitcoin Price PnL')
                        }
                    }

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
