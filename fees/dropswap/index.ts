import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Recepient address : 0xa8538D928338790861bB39Fb9Ef71E8F56747b49
// Maps DefiLlama chain identifiers to DropSwap's internal chain keys (used by its API)
const chains: Record<string, string> = {
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.BASE]: 'base',
  [CHAIN.BSC]: 'bsc',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.AVAX]: 'avalanche',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.UNICHAIN]: 'unichain',
  [CHAIN.HYPERLIQUID]: 'hyperevm',
  [CHAIN.SEI]: 'sei',
  [CHAIN.BERACHAIN]: 'berachain',
  [CHAIN.MONAD]: 'monad',
  [CHAIN.ROBINHOOD]: 'robinhood',
  [CHAIN.PLASMA]: 'plasma',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.SCROLL]: 'scroll',
  [CHAIN.BLAST]: 'blast',
  [CHAIN.MANTLE]: 'mantle',
  [CHAIN.XDAI]: 'gnosis',
  [CHAIN.SONEIUM]: 'soneium',
  [CHAIN.SOLANA]: 'solana',
  [CHAIN.ABSTRACT]: 'abstract',
};

interface IFeesByChainRecord {
  date: string;
  timestamp: number;
  chains: Record<string, { fees: number; revenue: number; holdersRevenue: number; supplySideRevenue: number; protocolRevenue: number }>;
}

// DropSwap's own public API, aggregating the 0.25% integrator fee from its backend database, grouped by day and chain
// https://dropswap.finance/api/defillama/fees-by-chain
const API_URL = "https://dropswap.finance/api/defillama/fees-detailed-by-chain";

const prefetch = async (options: FetchOptions): Promise<any> => {
  const data: IFeesByChainRecord[] = await fetchURL(API_URL);
  return data;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data: IFeesByChainRecord[] = options.preFetchedResults;
  const dayRecord = data.find((d) => d.date === options.dateString);
  const chainKey = chains[options.chain];
  const chainData = dayRecord?.chains?.[chainKey];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(chainData?.fees ?? 0, "Integrator Fees");

  dailyRevenue.addUSDValue(chainData?.holdersRevenue ?? 0, "Integrator Fees to Token Buybacks");
  dailyRevenue.addUSDValue(chainData?.protocolRevenue ?? 0, "Integrator Fees to Protocol");

  dailyProtocolRevenue.addUSDValue(chainData?.protocolRevenue ?? 0, "Integrator Fees to Protocol");
  dailyHoldersRevenue.addUSDValue(chainData?.holdersRevenue ?? 0, "Integrator Fees to Token Buybacks");
  dailySupplySideRevenue.addUSDValue(chainData?.supplySideRevenue ?? 0, "Integrator Fees to Swap Campaigns");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "A 0.25% integrator fee is charged on the input token of every swap routed through DropSwap, recorded per chain in DropSwap's own database.",
  Revenue: "Includes part of integrator fees retained by the protocol and part of integrator fees used to fund $DROP buybacks and burns.",
  ProtocolRevenue: "Part of integrator fees retained by the protocol.",
  HoldersRevenue: "Part of integrator fees used to fund $DROP buybacks and burns.",
  SupplySideRevenue: "Part of integrator fees used to fund swap campaigns.",
}

const breakdownMethodology = {
  Fees: {
    "Integrator Fees": "A 0.25% integrator fee is charged on the input token of every swap routed through DropSwap, recorded per chain in DropSwap's own database.",
  },
  Revenue: {
    "Integrator Fees to Token Buybacks": "Part of integrator fees used to fund $DROP buybacks and burns.",
    "Integrator Fees to Protocol": "Part of integrator fees retained by the protocol.",
  },
  ProtocolRevenue: {
    "Integrator Fees to Protocol": "Part of integrator fees retained by the protocol.",
  },
  HoldersRevenue: {
    "Integrator Fees to Token Buybacks": "Part of integrator fees used to fund $DROP buybacks and burns.",
  },
  SupplySideRevenue: {
    "Integrator Fees to Swap Campaigns": "Part of integrator fees used to fund swap campaigns.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  chains: Object.keys(chains),
  fetch,
  start: '2026-06-11',
  methodology,
  breakdownMethodology,
};

export default adapter;
