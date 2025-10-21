import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

// Each entry in the history is a tuple: [timestamp, value]
type HistoryEntry = [number, string];

interface HistoryData {
    accountValueHistory: HistoryEntry[];
    pnlHistory: HistoryEntry[];
    vlm: string;
}

// The main data structure is a tuple of string key and HistoryData
type PortfolioData = [
    ["day", HistoryData],
    ["week", HistoryData],
    ["month", HistoryData],
    ["allTime", HistoryData],
    ["perpDay", HistoryData],
    ["perpWeek", HistoryData],
    ["perpMonth", HistoryData],
    ["perpAllTime", HistoryData]
];

// Multi-Sigs
const MS_1 = "0x128Cc5830214aBAF05A0aC178469a28de56C0BA9";
const MS_2 = "0x950e6bc9bba0edf4e093b761df05cf5abd0a32e7";
const MS_3 = "0x4E961B977085B673c293a5C022FdcA2ab3A689a2";
const MS_4 = "0xc8f969ef6b51a428859f3a606e6b103dc1fb92e9";
const MS_5 = "0x2cd4aa47e778fe8fa27cdcd4ce2bc99b6bf90f61";
const MS_ALL = [MS_1, MS_2, MS_3, MS_4, MS_5];

// Function to extract pnlHistory from day data (index 0)
function extractDayPnlHistory(response: PortfolioData): HistoryEntry[] {
    return response[0][1].pnlHistory;
}

// Function to extract pnlHistory from allTime data (index 3)
function extractAllTimePnlHistory(response: PortfolioData): HistoryEntry[] {
    return response[3][1].pnlHistory;
}

// Function to extract data based on path without jmespath
function extractDataByPath<T>(response: PortfolioData, path: string): T {
    switch (path) {
        case "[0][1].pnlHistory":
            return extractDayPnlHistory(response) as T;
        case "[3][1].pnlHistory":
            return extractAllTimePnlHistory(response) as T;
        default:
            throw new Error(`Unsupported path: ${path}`);
    }
}

async function fetchHyperliquidInfo<T>(input: any, path: string): Promise<T> {
    const response = await httpPost("https://api.hyperliquid.xyz/info", input);
    const data = extractDataByPath<T>(response as PortfolioData, path);
    return data;
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    let JMES_TO_PNL = "[0][1].pnlHistory";
    const DELAY = 200; // ms
    // const delay = 10000 // ms
    const START_TIMESTAMP = options.startTimestamp * 1e3;
    const END_TIMESTAMP = options.endTimestamp * 1e3;

    // Determine if START_TIMESTAMP is today or yesterday
    const now = new Date();
    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    ).getTime();
    const yesterday = today - 24 * 60 * 60 * 1000;

    if (START_TIMESTAMP !== today && START_TIMESTAMP !== yesterday) {
        // if backfill, use `allTime`
        JMES_TO_PNL = "[3][1].pnlHistory";
    }

    // Fetch pnlHistory for all MS addresses and concatenate them with DELAY delay between calls
    const allPnlHistories: HistoryEntry[][] = [];
    for (const ms of MS_ALL) {
        const pnlHistory = await fetchHyperliquidInfo<HistoryEntry[]>(
            { type: "portfolio", user: ms },
            JMES_TO_PNL
        );
        allPnlHistories.push(pnlHistory);
        await new Promise((res) => setTimeout(res, DELAY));
    }
    // Flatten all histories into a single array
    const dailyPnlHistory = allPnlHistories.flat();

    // Aggregate total PnL between START_TIMESTAMP and END_TIMESTAMP (inclusive)
    let totalPnl = 0;
    for (const [timestamp, pnlStr] of dailyPnlHistory) {
        const ts = Number(timestamp);
        if (ts >= START_TIMESTAMP && ts <= END_TIMESTAMP) {
            totalPnl += Number(pnlStr);
        }
    }
    dailyFees.addCGToken("usd-coin", totalPnl);

    return {
        dailyFees,
        dailyRevenue: '0',
        dailyProtocolRevenue: '0',
        dailySupplySideRevenue: dailyFees,
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: '2025-06-06',
            meta: {
                methodology: {
                    Fees: "Yield generated from HLP vault",
                    Revenue: "No Revenue for hyperwave protocol",
                    ProtocolRevenue: "No Protocol share in revenue",
                    SupplySideRevenue: "100% of yield paid to hwHLP holders"
                },
            },
        },
    },
    allowNegativeValue: true, // PnL can be negative
};

export default adapter;
