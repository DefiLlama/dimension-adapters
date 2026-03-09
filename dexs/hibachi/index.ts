import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

type FutureContracts = {
  id: number;
  symbol: string;
  volume: string | null;
  low: string | null;
  high: string | null;
};

type ChainVolume = {
  chain_name: string;
  volume: number;
};

interface Response {
  future_contracts: FutureContracts[];
  timestamp: string;
  chain_volumes: ChainVolume[];
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const response: Response = await httpGet(
    `https://data-api.hibachi.xyz/exchange/stats/volumes?start_timestamp=${options.fromTimestamp}&end_timestamp=${options.toTimestamp}`
  );

  const chain_volume =
    response.chain_volumes?.find(
      (d) => d.chain_name.toLowerCase() === options.chain.toLowerCase()
    )?.volume ?? 0;

  return {
    dailyVolume: chain_volume
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: '2025-06-01',
  chains: [CHAIN.ARBITRUM, CHAIN.BASE],
};

export default adapter;
