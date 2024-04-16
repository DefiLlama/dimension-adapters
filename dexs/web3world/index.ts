import BigNumber from "bignumber.js";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { postURL } from "../../utils/fetchURL";

interface IWeb3WorldPoolsStats {
  pools: Array<{
    meta: {
      currencies: string[];
      currencyAddresses: string[];
      poolAddress: string;
      lpAddress: string;
      pairType: string;
      fee: string;
      feeBeneficiary: string | null;
      beneficiaryAddress: string | null;
    };
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
  let dailyVolumeBN = new BigNumber(0);
  let dailyFeesBN = new BigNumber(0);
  let totalFeesBN = new BigNumber(0);
  response.pools.forEach((pool) => {
    dailyVolumeBN = dailyVolumeBN.plus(pool.volume24h);
    dailyFeesBN = dailyFeesBN.plus(pool.fee24h);
    totalFeesBN = totalFeesBN.plus(pool.feeAllTime);
  });
  return {
    dailyVolume: dailyVolumeBN.toString(10),
    dailyFees: dailyFeesBN.toString(10),
    dailyUserFees: dailyFeesBN.toString(10),
    totalFees: totalFeesBN.toString(10),
  };
};
const adapter: SimpleAdapter = {
  adapter: {
    venom: {
      fetch,
      runAtCurrTime: true,
      start: 1713139200, // 2024-04-15T00:00:00.000Z
    },
  },
  version: 2,
};

export default adapter;
