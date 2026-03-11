import { SimpleAdapter, FetchOptions } from '../adapters/types';
import { CHAIN } from "../helpers/chains";
import fetchURL from '../utils/fetchURL';

interface ChainData {
  id: string;
  feeCollected?: number;
}

const getFees = async (chainCode: string, fromDate: string, toDate: string): Promise<number> => {
  const url = `https://stats.a11bd.net/aggregated?dateFrom=${fromDate}&dateTo=${toDate}`;
  const responseBody = (await fetchURL(url));
  const chainData = responseBody.data.chains
    .filter((d: ChainData) => d.id === chainCode)
    .pop();
  return chainData?.feeCollected ?? 0;
}

const chainConfig: Record<string, { chainCode: string; start: number }> = {
  [CHAIN.ETHEREUM]: { chainCode: "ETH", start: 1636761600 },
  [CHAIN.BSC]: { chainCode: "BSC", start: 1636761600 },
  [CHAIN.TERRA]: { chainCode: "TRA", start: 1639008000 },
  [CHAIN.AURORA]: { chainCode: "AURO", start: 1639440000 },
  [CHAIN.POLYGON]: { chainCode: "POL", start: 1636502400 },
  [CHAIN.HECO]: { chainCode: "HECO", start: 1636761600 },
  [CHAIN.CELO]: { chainCode: "CELO", start: 1636761600 },
  [CHAIN.AVAX]: { chainCode: "AVA", start: 1636761600 },
  [CHAIN.FANTOM]: { chainCode: "FTM", start: 1637452800 },
  [CHAIN.FUSE]: { chainCode: "FUSE", start: 1640995200 },
  [CHAIN.SOLANA]: { chainCode: "SOL", start: 1636502400 },
  [CHAIN.NEAR]: { chainCode: "NEAR", start: 1643673600 },
  [CHAIN.HARMONY]: { chainCode: "HRM", start: 1640995200 },
  [CHAIN.TEZOS]: { chainCode: "TEZ", start: 1654387200 },
  [CHAIN.KLAYTN]: { chainCode: "KLAY", start: 1660521600 },
  [CHAIN.WAVES]: { chainCode: "WAVE", start: 1663200000 },
  [CHAIN.STELLAR]: { chainCode: "XLM", start: 1672358400 },
  [CHAIN.STACKS]: { chainCode: "STKS", start: 1690416000 },
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const chain = options.chain;
  const config = chainConfig[chain];
  if (chain === CHAIN.HECO) { return {} } // skip HECO for now
  const chainCode = config.chainCode;
  const dateString = new Date(options.startOfDay * 1000).toISOString().split("T")[0];
  const df = await getFees(chainCode, dateString, dateString);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(df, 'Bridge Fees');
  const dailyRevenue = dailyFees.clone(0.2, 'Bridge Fees');
  const dailySupplySideRevenue = dailyFees.clone(0.8, 'Bridge Fees');

  return {
    dailyFees,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Users pay bridge fee for each transfer on the source chain.",
  ProtocolRevenue: "Protocol receives 20% of the collected bridge fee.",
  SupplySideRevenue: "80% of the collected bridge fee is used for rewards to the stakers",
};

const breakdownMethodology = {
  Fees: {
    "Bridge Fees": "Fees charged to users for each cross-chain token transfer on the source chain.",
  },
  ProtocolRevenue: {
    "Bridge Fees": "20% of bridge fees collected by the protocol treasury.",
  },
  SupplySideRevenue: {
    "Bridge Fees": "80% of bridge fees distributed as rewards to stakers who provide liquidity.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter;
