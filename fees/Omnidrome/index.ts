import { FetchResultFees, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { fees_bribes } from "./bribes";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const lphelper = '0x11D66FF243715169d6C14865E18fcc30d3557830';
const abis: any = {
  "forSwaps": "function forSwaps() view returns ((address lp, bool stable, address token0, address token1, address factory, uint256 poolFee)[])"
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const forSwaps = await sdk.api2.abi.call({ target: lphelper, abi: abis.forSwaps, chain: CHAIN.ZETA, })
  const pools = forSwaps.map((e: any) => e.lp)

  const res: any = await getDexFees({ chain: CHAIN.ZETA, fromTimestamp, toTimestamp, pools, timestamp, })
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ZETA, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ZETA, {}));
  const dailyBribesRevenue = await fees_bribes(fromBlock, toBlock, timestamp);
  res.dailyBribesRevenue = dailyBribesRevenue.toString();
  return res

}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ZETA]: {
      fetch: fetch,
      start: 1707177600,
    }
  }
}
export default adapters;
