import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";
import { fees_bribes } from "./bribes";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const gurar = '0x066D31221152f1f483DA474d1Ce47a4F50433e22';
const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, bool stable, address token0, address token1, address factory, uint256 poolFee)[])"
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
  const forSwaps = await sdk.api2.abi.call({ target: gurar, abi: abis.forSwaps, chain: CHAIN.BASE, params: [1000, 0] })
  const pools = forSwaps.map((e: any) => e.lp)
  fetchOptions.api.multiCall = multiCall
  const res: any = await getDexFees({ chain: CHAIN.BASE, fromTimestamp: fetchOptions.fromTimestamp, toTimestamp: fetchOptions.toTimestamp, pools, timestamp, fetchOptions })
  res.dailyBribesRevenue = await fees_bribes(fetchOptions);

  return res

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
