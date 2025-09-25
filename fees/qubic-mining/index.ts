import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data: QubicBurnData[] = await fetchURL(API_ENDPOINT);
  
  // Calculate daily fees by grouping by date and summing amounts
  const dailyMap = new Map<string, number>();
  
  data.forEach(item => {
    // Extract date from timestamp (format: "2025-08-14T17:00:00")
    const date = item.timestamp.split('T')[0];
    const qubicAmount = Number(item.amount);
    const existingAmount = dailyMap.get(date) || 0;
    dailyMap.set(date, existingAmount + qubicAmount);
  });

  const dailyFees = options.createBalances()
  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  dailyFees.addCGToken('qubic-network', dailyMap.get(dateString) || 0)
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
    Fees: 'All fees collected from Monero mining rewards.',
    Revenue: 'All fees collected from Monero mining rewards.',
    ProtocolRevenue: 'Protocol takes no revenue shares.',
    HoldersRevenue: 'All fees are used to buy back QUBIC and burn them.',
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch: fetch,
  start: '2025-05-14',
  chains: [CHAIN.QUBIC],
  methodology,
};

export default adapter;
