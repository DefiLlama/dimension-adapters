/*
 * DeFiLlama Dimension Adapter for Rocket
 *
 * Tracks daily volume and fees for Rocket - a high-performance L1
 * blockchain for trading perpetual futures.
 *
 * Data sources:
 *   GET /instruments        - list all trading pairs
 *   GET /candles            - OHLCV data with volume per instrument
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

interface Candle {
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
    quoteVolume?: string;
    timestamp?: number;
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
    // Step 1: Get all instruments
    let instruments: string[] = [];
    try {
          const instData = await fetchURL(`${ROCKET_API}/instruments`);
          const ii = instData.instruments || instData;

      if (typeof ii === "object" && !Array.isArray(ii)) {
              instruments = Object.keys(ii);
      } else if (Array.isArray(ii)) {
              instruments = ii.map(
                        (i: any) => i.instrumentId || i.id || i.ticker || ""
                      ).filter(Boolean);
      }
    } catch (e) {
          console.error("Failed to fetch instruments:", e);
          return { dailyVolume: "0", dailyFees: "0", dailyRevenue: "0", timestamp };
    }

    // Step 2: Sum 24h volume across all instruments using 1h candles
    let totalDailyVolume = 0;

    for (const instrumentId of instruments) {
          try {
                  const candleData = await fetchURL(
                            `${ROCKET_API}/candles?instrumentId=${encodeURIComponent(instrumentId)}&interval=1h&limit=24`
                          );
                  const candles: Candle[] = candleData.candles || [];

            for (const candle of candles) {
                      const vol = parseFloat(candle.quoteVolume || "0");
                      if (vol > 0) {
                                  totalDailyVolume += vol;
                      } else {
                                  const baseVol = parseFloat(candle.volume || "0");
                                  const price = parseFloat(candle.close || "0");
                                  if (baseVol > 0 && price > 0) {
                                                totalDailyVolume += baseVol * price;
                                  }
                      }
            }
          } catch (e) {
                  console.error(`Failed candles for ${instrumentId}:`, e);
          }
    }

    // Step 3: Calculate fees and revenue
    const dailyFees = totalDailyVolume * AVG_FEE_RATE;
    const dailyRevenue = dailyFees;

    return {
          dailyVolume: totalDailyVolume.toString(),
          dailyFees: dailyFees.toString(),
          dailyRevenue: dailyRevenue.toString(),
          timestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
          [CHAIN.ETHEREUM]: {
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
