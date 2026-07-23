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

const chainConfig: Record<string, { chainCode: string; start: string; }> = {
  [CHAIN.ETHEREUM]: { chainCode: "ETH", start: '2021-11-13' },
  [CHAIN.BSC]: { chainCode: "BSC", start: '2021-11-13' },
  [CHAIN.TERRA]: { chainCode: "TRA", start: '2021-12-09' },
  [CHAIN.AURORA]: { chainCode: "AURO", start: '2021-12-14' },
  [CHAIN.POLYGON]: { chainCode: "POL", start: '2021-11-10' },
  [CHAIN.HECO]: { chainCode: "HECO", start: '2021-11-13' },
  [CHAIN.CELO]: { chainCode: "CELO", start: '2021-11-13' },
  [CHAIN.AVAX]: { chainCode: "AVA", start: '2021-11-13' },
  [CHAIN.FANTOM]: { chainCode: "FTM", start: '2021-11-21' },
  [CHAIN.FUSE]: { chainCode: "FUSE", start: '2022-01-01' },
  [CHAIN.SOLANA]: { chainCode: "SOL", start: '2021-11-10' },
  [CHAIN.NEAR]: { chainCode: "NEAR", start: '2022-02-01' },
  [CHAIN.HARMONY]: { chainCode: "HRM", start: '2022-01-01' },
  [CHAIN.TEZOS]: { chainCode: "TEZ", start: '2022-06-05' },
  [CHAIN.KLAYTN]: { chainCode: "KLAY", start: '2022-08-15' },
  [CHAIN.WAVES]: { chainCode: "WAVE", start: '2022-09-15' },
  [CHAIN.STELLAR]: { chainCode: "XLM", start: '2022-12-30' },
  [CHAIN.STACKS]: { chainCode: "STKS", start: '2023-07-27' },
}

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const config = chainConfig[chain];
  if (chain === CHAIN.HECO) { return {} } // skip HECO for now
  const chainCode = config.chainCode;
  const dateString = options.dateString;
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
