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

import { SimpleAdapter, FetchResult, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";
import { METRIC } from "../../helpers/metrics";

const ROCKET_API = "https://beta.rocket-cluster-1.com";
const MAKER_FEE = 0.0001; // 0.01%
const TAKER_FEE = 0.0001; // 0.01%

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    let instruments: string[] = [];
    try {
        const instrumentsData = await fetchURL(`${ROCKET_API}/instruments`);
        instruments = Object.keys(instrumentsData.instruments);
    } catch (e) {
        throw new Error(`Rocket adapter: failed to fetch instruments: ${String(e)}`);
    }

    const dailyVolume = options.createBalances();
    const startTime = options.startOfDay * 1000;

    await PromisePool.withConcurrency(1)
        .for(instruments)
        .process(async (instrumentId) => {
            const candleData = await fetchURLAutoHandleRateLimit(
                `${ROCKET_API}/candles?instrumentId=${encodeURIComponent(instrumentId)}&interval=1d&startTime=${startTime}&endTime=${startTime + 86399999}`
            );
            const candles: any[] = candleData.candles || [];
            if (candles[0]?.quoteVolume) {
                dailyVolume.addUSDValue(parseFloat(candles[0]?.quoteVolume));
            } else {
                dailyVolume.addUSDValue(parseFloat(candles[0]?.volume ?? "0") * parseFloat(candles[0]?.close ?? "0"));
            }
        });

    const dailyFees = dailyVolume.clone(MAKER_FEE + TAKER_FEE, METRIC.TRADING_FEES);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Volume: "24h trading volume is calculated by summing OHLCV candle volume across all perpetual instruments on Rocket Chain.",
    Fees: "0.01% maker and 0.01% taker fees charged on each trade",
    Revenue: "All the fees are revenue",
    ProtocolRevenue: "All the fees are protocol revenue",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "0.01% maker fees and 0.01% taker fees.",
    },
    Revenue: {
        [METRIC.TRADING_FEES]: "0.01% maker fees and 0.01% taker fees.",
    },
    ProtocolRevenue: {
        [METRIC.TRADING_FEES]: "0.01% maker fees and 0.01% taker fees.",
    }
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.OFF_CHAIN],
    fetch,
    start: '2026-02-18',
    methodology,
    breakdownMethodology,
};

export default adapter;
