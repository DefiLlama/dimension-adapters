/*
 * DeFiLlama Dimension Adapter for Rocket
 *
 * Tracks daily volume and fees for Rocket - a high-performance L1
 * blockchain for trading perpetual futures.
 *
 * Data sources:
 *   GET /instruments     - list all trading pairs
 *   GET /candles         - OHLCV data with volume per instrument
 *
 * Fee structure: 0.01% maker / 0.01% taker (from Rocket UI)
 * Website: https://rocketfi.io
 * API Docs: https://rocketfoundation.gitbook.io/rocket-docs/rocket/api
 */

import { SimpleAdapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const ROCKET_API = "https://beta.rocket-cluster-1.com";
const MAKER_FEE = 0.0001; // 0.01%
const TAKER_FEE = 0.0001; // 0.01%
const AVG_FEE_RATE = (MAKER_FEE + TAKER_FEE) / 2;
const CONCURRENCY = 5;

/** Shape returned by the /instruments endpoint */
interface InstrumentData {
            instrumentId?: string;
            id?: string;
            ticker?: string;
}

/** Single OHLCV candle from /candles endpoint */
interface Candle {
            close?: string;
            volume?: string;
            quoteVolume?: string;
}

/**
 * Normalize the instruments response into an array.
 * The API may return an array, an object with an `instruments` key,
 * or a plain dictionary keyed by instrument ID.
 */
function normalizeInstruments(data: any): InstrumentData[] {
            if (!data) return [];

    // Direct array response
    if (Array.isArray(data)) return data;

    // Nested under .instruments key
    const nested = data.instruments;
            if (nested) {
                            if (Array.isArray(nested)) return nested;
                            if (typeof nested === "object") return Object.values(nested);
            }

    // Plain dictionary keyed by instrument ID
    if (typeof data === "object") return Object.values(data);

    return [];
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
            // Step 1: Fetch all instruments
            let instruments: string[] = [];
            try {
                            const instrumentsData = await fetchURL(`${ROCKET_API}/instruments`);
                            const ii: InstrumentData[] = normalizeInstruments(instrumentsData);
                            instruments = ii
                                .map((i: InstrumentData) => i.instrumentId || i.id || i.ticker || "")
                                .filter((id: string) => id.length > 0);
            } catch (e) {
                            console.error("Failed to fetch instruments:", e);
                            throw new Error(`Rocket adapter: failed to fetch instruments: ${String(e)}`);
            }

            // Step 2: Sum 24h volume across all instruments using 1h candles
            // Uses bounded concurrency to avoid overwhelming the API
            let totalDailyVolume = 0;

            for (let i = 0; i < instruments.length; i += CONCURRENCY) {
                            const batch = instruments.slice(i, i + CONCURRENCY);
                            const results = await Promise.allSettled(
                                                batch.map(async (instrumentId) => {
                                                                        const candleData = await fetchURL(
                                                                                                    `${ROCKET_API}/candles?instrumentId=${encodeURIComponent(instrumentId)}&interval=1h&limit=24`
                                                                                                );
                                                                        const candles: Candle[] = candleData.candles || [];
                                                                        let instrumentVolume = 0;

                                                                          for (const candle of candles) {
                                                                                                      const vol = parseFloat(candle.quoteVolume || "0");
                                                                                                      if (vol > 0) {
                                                                                                                                      instrumentVolume += vol;
                                                                                                              } else {
                                                                                                                                      const baseVol = parseFloat(candle.volume || "0");
                                                                                                                                      const price = parseFloat(candle.close || "0");
                                                                                                                                      if (baseVol > 0 && price > 0) {
                                                                                                                                                                          instrumentVolume += baseVol * price;
                                                                                                                                              }
                                                                                                              }
                                                                          }
                                                                        return instrumentVolume;
                                                })
                                            );

                for (const result of results) {
                                    if (result.status === "fulfilled") {
                                                            totalDailyVolume += result.value;
                                    } else {
                                                            console.error("Failed candle fetch in batch:", result.reason);
                                    }
                }
            }

            // Step 3: Calculate fees and revenue
            const dailyFees = totalDailyVolume * AVG_FEE_RATE;

            return {
                            dailyVolume: totalDailyVolume.toString(),
                            dailyFees: dailyFees.toString(),
                            dailyRevenue: dailyFees.toString(),
                            timestamp,
            };
};

const adapter: SimpleAdapter = {
            adapter: {
                            [CHAIN.ARBITRUM]: {
                                                fetch: fetchVolume,
                                                start: '2025-01-01',
                                                meta: {
                                                                        methodology: {
                                                                                                    Volume:
                                                                                                                                    "24h trading volume is calculated by summing OHLCV candle volume " +
                                                                                                                                    "across all perpetual instruments on Rocket Chain.",
                                                                                                    Fees:
                                                                                                                                    "Trading fees are calculated as volume * average fee rate. " +
                                                                                                                                    "Rocket charges 0.01% maker and 0.01% taker fees.",
                                                                                                    Revenue:
                                                                                                                                    "Protocol revenue is estimated as total trading fees collected.",
                                                                        },
                                                },
                            },
            },
};

export default adapter;
