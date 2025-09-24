import { CHAIN } from "../../helpers/chains";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const API_ENDPOINT = "https://fattydoge.top/api/qubic/burn/all";

interface QubicBurnData {
  id: number;
  tickNumber: string;
  sourceId: string | null;
  destId: string | null;
  amount: number;
  txId: string;
  moneyFlew: boolean;
  epochNumber: number;
  timestamp: string;
  price: number;
}

const fetchData: FetchV2 = async () => {
  const data: QubicBurnData[] = await fetchURL(API_ENDPOINT);
  
  // Calculate daily fees by grouping by date and summing amounts
  const dailyMap = new Map<string, number>();
  
  data.forEach(item => {
    // Extract date from timestamp (format: "2025-08-14T17:00:00")
    const date = item.timestamp.split('T')[0];
    const usdValue = item.amount * item.price;
    const existingAmount = dailyMap.get(date) || 0;
    dailyMap.set(date, existingAmount + usdValue);
  });

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  const dailyFees = dailyMap.get(today) || 0;
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
    Fees: 'All fees collected from XMR and XTM mining rewards.',
    Revenue: 'All fees collected from XMR and XTM mining rewards.',
    ProtocolRevenue: 'Protocol revenue takes no revenue shares.',
    HoldersRevenue: 'All fees are used to buy back QUBIC and burn them.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.QUBIC]: {
      start: '2025-05-14',
      fetch: fetchData,
      runAtCurrTime: true,
    },
  },
  methodology,
};

export default adapter;
