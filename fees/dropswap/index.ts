import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
};

interface IFeesByChainRecord {
  date: string;
  timestamp: number;
  chains: Record<string, { fees: number; revenue: number }>;
}

// DropSwap's own public API, aggregating the 0.25% integrator fee from its backend database, grouped by day and chain
// https://dropswap.finance/api/defillama/fees-by-chain
const API_URL = "https://dropswap.finance/api/defillama/fees-by-chain";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data: IFeesByChainRecord[] = await fetchURL(API_URL);
  const dayRecord = data.find((d) => d.date === options.dateString);
  const chainKey = chains[options.chain];
  const chainData = dayRecord?.chains?.[chainKey];

  const dailyFees = (chainData?.fees ?? 0).toString();
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: "0",
    dailySupplySideRevenue: "0",
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: Object.keys(chains),
  fetch,
  start: '2026-06-11',
  methodology: {
    Fees: "A 0.25% integrator fee is charged on the input token of every swap routed through DropSwap, recorded per chain in DropSwap's own database.",
    Revenue: "All collected fees are used to fund the swap reward campaign and an automated DROP buyback-and-burn; DropSwap does not retain a separate treasury cut.",
    ProtocolRevenue: "Same as Revenue — the full fee amount funds protocol-controlled mechanisms (rewards + burn), not third parties.",
    SupplySideRevenue: "None — DropSwap does not operate its own liquidity pools; it routes through third-party DEXs and aggregators (LI.FI, Odos).",
  },
};

export default adapter;
