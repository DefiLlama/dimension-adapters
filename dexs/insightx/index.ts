import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * InsightX Adapter for DefiLlama
 * 
 * Platform: Prediction Market
 * Data Source: InsightX Backend API
 * 
 * Displays daily trading volume and protocol fees aggregated by the InsightX backend.
 * Data is fetched from: https://mainnet-api.insightx.finance/predict/v2/llama/stats
 */

interface InsightXDailyStats {
    date: string;
    volume: number;      // Daily trading volume in USD
    fees: number;        // Daily fees in USD
}

const INSIGHTX_API_BASE = "https://mainnet-api.insightx.finance/predict/v2/llama/stats";

/**
 * Fetch daily metrics from InsightX Backend API (Off-Chain)
 * 
 * Returns aggregated trading volume and protocol fees calculated off-chain
 */
const fetchOffChain = async (options: FetchOptions) => {
    const dateString = options.dateString;

    try {
        const url = `${INSIGHTX_API_BASE}?date=${dateString}`;
        console.log(`[DEBUG] Fetching: ${url}`);

        const response = await httpGet(url);
        console.log(`[DEBUG] Response:`, JSON.stringify(response));

        const data: InsightXDailyStats = response;

        const dailyVolume = options.createBalances();
        const dailyFees = options.createBalances();

        // Add aggregated backend statistics
        if (data.volume) {
            dailyVolume.addUSDValue(data.volume);
        }

        if (data.fees) {
            dailyFees.addUSDValue(data.fees);
        }

        options.api.log(`InsightX Off-Chain [${dateString}] - Volume: $${data.volume}, Fees: $${data.fees}`);

        return { dailyVolume, dailyFees };
    } catch (error) {
        options.api.log(`Error fetching InsightX Off-Chain data for ${dateString}: ${error}`);
        throw error;
    }
};



const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: false,
    adapter: {
        [CHAIN.OFF_CHAIN]: {
            fetch: fetchOffChain,
            start: "2026-06-03",
            runAtCurrTime: false,
        },
    },
};

export default adapter;
