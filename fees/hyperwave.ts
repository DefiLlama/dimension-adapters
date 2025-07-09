import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains"
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

const fetch = async (options: FetchOptions) => {
    const eoa = MS_5
    const dailyFees = options.createBalances();
    const data:PortfolioData = await httpPost("https://api.hyperliquid.xyz/info", { type: "portfolio", user: eoa })
    const dailyData = data[0]
    // const perpDailyData = data[4]
    const dailyPnl = dailyData[1].pnlHistory
    // const dailyAccountVault = dailyData[1].accountValueHistory
    const dailyFeesData = dailyPnl.map((t: any) => ({ pnl: t[1]*1e6,time: t[0] * 1e3 }))
    const todayFees = dailyFeesData[dailyFeesData.length - 1].pnl
    dailyFees.addCGToken("usd-coin", todayFees/1e6)


    console.log(dailyPnl)

    return {
        dailyFees: dailyFees
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            meta: {
                methodology: {
                    Fees: "Yield generated from HLP vault",
                }
            }
        },
    },
}

export default adapter;