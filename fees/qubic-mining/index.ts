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
  burnFlag: boolean;
  epochNumber: number;
  timestamp: string;
  price: number;
}

const fetch = async (options: FetchOptions) => {
  const data: QubicBurnData[] = await fetchURL(API_ENDPOINT);

  // This community-run feed has previously gone stale for months at a time while still
  // returning HTTP 200 with old data - if its latest record predates the requested day,
  // "zero burns matched" is indistinguishable from "the feed stopped updating", so refuse
  // instead of silently reporting $0.
  const latestRecordDate = data.reduce((max: string, item: QubicBurnData) => {
    const date = item.timestamp.split('T')[0];
    return date > max ? date : max;
  }, '');
  if (latestRecordDate < options.dateString)
    throw new Error(`qubic-mining: burn feed's latest record (${latestRecordDate}) predates requested date ${options.dateString} - feed may be stale`);

  const dailyQubicBurnt = data.reduce((totalBurnt: number, item: QubicBurnData) => {
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

const breakdownMethodology = {
  Fees: {
    'Mining rewards': 'QUBIC value of Monero mining rewards routed through the burn mechanism.',
  },
  HoldersRevenue: {
    'QUBIC burns': 'All fees are used to buy back QUBIC and burn them, benefiting all token holders.',
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch: fetch,
  start: '2025-05-14',
  chains: [CHAIN.QUBIC],
  methodology,
  breakdownMethodology,
};

export default adapter;
