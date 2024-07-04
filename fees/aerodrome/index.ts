import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { fees_bribes } from "./bribes";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const sugar = '0xe521fc2C55AF632cdcC3D69E7EFEd93d56c89015';
const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, int24 type, address token0, address token1, address factory, uint256 pool_fee)[])"
}

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResultFees> => {
  const chunkSize = 500;
  let currentOffset = 0;
  let unfinished = true;
  const allPools: any[] = [];

  while (unfinished) {
    const allPoolsChunk = await fetchOptions.api.call({ target: sugar, abi: abis.forSwaps, params: [chunkSize, currentOffset], chain: CHAIN.BASE })
    unfinished = allPoolsChunk.length !== 0;
    currentOffset += chunkSize;
    allPools.push(...allPoolsChunk);
  }

  const pools = [...new Set(allPools.map((e: any) => e.lp))]
  const timestamp = fetchOptions.startOfDay;
  const res: any = await getDexFees({ chain: CHAIN.BASE, fromTimestamp: fetchOptions.fromTimestamp, toTimestamp: fetchOptions.toTimestamp, pools, timestamp, fetchOptions })
  res.dailyBribesRevenue = await fees_bribes(fetchOptions);
  return res;
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch,
      start: 1693180800,
    }
  }
}
export default adapters;
