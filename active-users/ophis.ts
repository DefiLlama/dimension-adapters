import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://rebates.ophis.fi/defillama";

const chainIds: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.XDAI]: 100,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.POLYGON]: 137,
  [CHAIN.ROBINHOOD]: 4663,
  [CHAIN.BASE]: 8453,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.INK]: 57073,
  [CHAIN.LINEA]: 59144,
};

interface ChainDay {
  chainId: number;
  transactions: number;
  users: number;
}

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(`${API}?date=${encodeURIComponent(options.dateString)}`);
  if (!response?.ok || !Array.isArray(response.chains)) {
    throw new Error(`ophis: incomplete reporting response for ${options.dateString}`);
  }
  const row = (response.chains as ChainDay[]).find((item) => item.chainId === chainIds[options.chain]);
  return {
    dailyActiveUsers: row?.users ?? 0,
    dailyTransactionsCount: row?.transactions ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(chainIds),
  start: "2026-05-14",
};

export default adapter;
