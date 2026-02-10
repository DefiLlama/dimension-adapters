import { Fetch, FetchResult, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface ApiResponse {
  chain: string;
  date_time: number;
  volume: string;
}

const api = "https://api.stableflow.ai/v1/dashboard/chain/daily";

const chainMap: Record<string, string> = {
  [CHAIN.ETHEREUM]: "eth",
  [CHAIN.ARBITRUM]: "arb",
  [CHAIN.POLYGON]: "pol",
  [CHAIN.BSC]: "bsc",
  [CHAIN.OPTIMISM]: "op",
  [CHAIN.AVAX]: "avax",
  [CHAIN.BERACHAIN]: "bera",
  [CHAIN.XLAYER]: "xlayer",
  [CHAIN.PLASMA]: "plasma",
  [CHAIN.SOLANA]: "sol",
  [CHAIN.NEAR]: "near",
  [CHAIN.TRON]: "tron",
  [CHAIN.APTOS]: "aptos",
  [CHAIN.BASE]: "base",
};

const prefetch: FetchV2 = async () => {
  const res = await fetchURL(api);
  if (res.code !== 200) {
    return [];
  }
  return res?.data || [];
};

const fetch: Fetch = async (_timestamp, _chainBlocks, options): Promise<FetchResult> => {
  const {
    chain: currentChainBlock,
    startTimestamp,
    endTimestamp,
    preFetchedResults: data,
  } = options;

  const record = Array.isArray(data) && data.find((item: ApiResponse) => {
    return item.chain === chainMap[currentChainBlock] && item.date_time >= startTimestamp && item.date_time < endTimestamp;
  });

  return {
    dailyVolume: record?.volume || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  chains: Object.keys(chainMap),
  start: "2025-10-10",
};

export default adapter;
