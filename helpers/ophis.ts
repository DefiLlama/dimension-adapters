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

const dailyResponseCache = new Map<string, Promise<OphisDayResponse>>();

function getOphisDayResponse(dateString: string): Promise<OphisDayResponse> {
  let response = dailyResponseCache.get(dateString);
  if (!response) {
    response = fetchURL(`${URL}?date=${dateString}`).then((data: OphisDayResponse) => {
      if (!data.ok || data.date !== dateString || !Array.isArray(data.chains)) {
        throw new Error(`Invalid Ophis daily metrics response for ${dateString}`);
      }
      return data;
    });
    dailyResponseCache.set(dateString, response);
  }
  return response;
}

/**
 * Fetches the Ophis daily metrics for `options.chain` on `options.dateString`.
 * @param options DefiLlama fetch options identifying the requested chain and UTC date.
 * @returns The matching chain metrics, or `undefined` when the daily response has no data for that chain.
 */
export async function fetchOphisChainDay(options: FetchOptions): Promise<OphisChainDay | undefined> {
  const chainId = OPHIS_CHAINS[options.chain];
  if (chainId === undefined) throw new Error(`Unsupported Ophis chain ${options.chain}`);
  const response = await getOphisDayResponse(options.dateString);
  return response.chains.find((row) => row.chainId === chainId);
}
