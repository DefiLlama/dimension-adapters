import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import fetchURL from "../utils/fetchURL";

const URL = "https://rebates.ophis.fi/defillama";

export const OPHIS_CHAINS: Record<string, number> = {
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

export interface OphisChainDay {
  chainId: number;
  volumeUsd: number;
  feesUsd: number;
  revenueUsd: number;
  supplySideRevenueUsd: number;
  trades: number;
}

interface OphisDayResponse {
  ok: boolean;
  date: string;
  chains: OphisChainDay[];
}

export async function fetchOphisChainDay(options: FetchOptions): Promise<OphisChainDay | undefined> {
  const chainId = OPHIS_CHAINS[options.chain];
  if (chainId === undefined) throw new Error(`Unsupported Ophis chain ${options.chain}`);
  const response: OphisDayResponse = await fetchURL(`${URL}?date=${options.dateString}`);
  if (!response.ok || response.date !== options.dateString || !Array.isArray(response.chains)) {
    throw new Error(`Invalid Ophis daily metrics response for ${options.dateString}`);
  }
  return response.chains.find((row) => row.chainId === chainId);
}
