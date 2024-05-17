import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";
import { fees_bribes } from "./bribes";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const sugar = '0xe521fc2C55AF632cdcC3D69E7EFEd93d56c89015';
const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, int24 type, address token0, address token1, address factory, uint256 pool_fee)[])"
}

// defualt abi for multiCall is error some pools
const multiCall = async (callN: any) => {
  return (await sdk.api.abi.multiCall({
    abi: callN.abi,
    calls: callN.calls.map((pool: any) => ({
      target: pool,
    })),
    chain: CHAIN.BASE,
    permitFailure: true,
  })).output.map((r: any) => r.output).flat()
}

const fetch = async (timestamp: number, _: ChainBlocks, fetchOptions: FetchOptions): Promise<FetchResultFees> => {
  const chunkSize = 500;
  let currentOffset = 0;
  let unfinished = true;
  const allPools: any[] = [];

  while (unfinished) {
    const allPoolsChunk = await sdk.api2.abi.call({ target: sugar, abi: abis.forSwaps, params: [chunkSize, currentOffset], chain: CHAIN.BASE, block: "latest", })
    unfinished = allPoolsChunk.length !== 0;
    currentOffset += chunkSize;
    allPools.push(...allPoolsChunk);
  }

  const pools = allPools.map((e: any) => e.lp)
  fetchOptions.api.multiCall = multiCall
  const res: any = await getDexFees({ chain: CHAIN.BASE, fromTimestamp: fetchOptions.fromTimestamp, toTimestamp: fetchOptions.toTimestamp, pools, timestamp, fetchOptions })
  res.dailyBribesRevenue = await fees_bribes(fetchOptions);
  return res;
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch,
      start: 1693180800,
    }
  }
}
export default adapters;