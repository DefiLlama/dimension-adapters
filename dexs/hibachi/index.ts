import type { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

type FutureContracts = {
  id: number;
  symbol: string;
  volume24h: string | null;
  low24h: string | null;
  high24h: string | null;
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

const fetch: Fetch = async (timestamp: number, chainBlocks, options) => {
  const response: Response = await httpGet(
    "https://data-api.hibachi.xyz/exchange/stats/volumes"
  );

  const chain_volume =
    response.chain_volumes?.find(
      (d) => d.chain_name.toLowerCase() === options.chain.toLowerCase()
    )?.volume ?? 0;

  const output = {
    dailyVolume: chain_volume.toString(),
    timestamp: new Date(Math.floor(Number(response.timestamp))).getTime() / 1000,
  };

  return output;
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2025-06-01",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2025-06-01",
    },
  },
};

export default adapter;
