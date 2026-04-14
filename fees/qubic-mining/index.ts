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

  const dailyQubicBurnt = data.reduce((totalBurnt: number, item: any) => {
    const date = item.timestamp.split('T')[0];
    if (date === options.dateString && item.burnFlag)
      totalBurnt += item.amount;
    return totalBurnt
  }, 0);

  const dailyFees = options.createBalances()
  dailyFees.addCGToken('qubic-network', dailyQubicBurnt);

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
