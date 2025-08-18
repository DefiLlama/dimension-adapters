import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { postURL } from "../../utils/fetchURL";

interface IWeb3WorldPoolsStats {
  pools: Array<{
    tvl: string;
    tvlChange: string;
    volumesLocked: string[];
    prices: string[];
    lpLocked: string;
    count24Transactions: number;
    volume24h: string;
    volume24hChange: string;
    volume7d: string;
    fee24h: string;
    fee7d: string;
    feeAllTime: string;
    stableOneSwap: string[] | null;
  }>;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const response: IWeb3WorldPoolsStats = await postURL(
    "https://api.web3.world/v2/pools",
    {
      limit: 1000,
      offset: 0,
      ordering: "tvldescending",
      whiteListUri: "https://static.web3.world/assets/manifest.json",
    }
  );
  let dailyVolume = 0
  let dailyFees = 0
  response.pools.forEach((pool) => {
    dailyVolume += +pool.volume24h;
    dailyFees = +pool.fee24h;
  });
  return {
    dailyVolume, dailyFees, dailyUserFees: dailyFees,
  };
};
const adapter: SimpleAdapter = {
  adapter: {
    venom: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-15', // 2024-04-15T00:00:00.000Z
    },
  },
  version: 1,
};

export default adapter;
