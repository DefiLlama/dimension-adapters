import type { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet, httpPost } from "../../utils/fetchURL";

type FutureContracts = {
  id: number;
  symbol: string;
  volume24h: string | null;
  low24h: string | null;
  high24h: string | null;
};

type DepositSummary = {
  spot_asset_id: number;
  deposit_quantity: number;
  deposit_volume: number;
  asset_id: number;
  chain_name: string;
  chain_type: string;
  chain_id: number;
  contract_address: string;
  quantum_decimals: number;
  name: string;
  symbol: string;
  asset_type: number;
  resolution_decimals: number;
  deposit_ratio: number;
};

type ChainVolume = {
  chain_name: string;
  volume: number;
}

interface Response {
  future_contracts: FutureContracts[];
  timestamp: string;
  deposit_summary?: DepositSummary[];
  chain_volumes: ChainVolume[]
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
    timestamp: new Date(response.timestamp).getTime() / 1000,
  };

  return output;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2025-03-28",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2025-03-28",
    },
  },
};

export default adapter;
