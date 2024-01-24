import { FetchResultFees, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { fees_bribes } from "./bribes";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const gurar = '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b';
const abis: any = {
  "forSwaps": "function forSwaps() view returns ((address lp, bool stable, address token0, address token1, address factory)[])"
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const forSwaps = await sdk.api2.abi.call({ target: gurar, abi: abis.forSwaps, chain: CHAIN.BASE, })
  const pools = forSwaps.map((e: any) => e.lp)

  const res: any = await getDexFees({ chain: CHAIN.BASE, fromTimestamp, toTimestamp, pools, timestamp, })
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.BASE, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.BASE, {}));
  const dailyBribesRevenue = await fees_bribes(fromBlock, toBlock, timestamp);
  res.dailyBribesRevenue = dailyBribesRevenue.toString();
  return res

}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch,
      start: async () => 1693180800,
    }
  }
}
export default adapters;
