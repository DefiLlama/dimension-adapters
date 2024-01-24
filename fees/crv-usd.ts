import { Chain } from "@defillama/sdk/build/general";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";

type TContract  = {
  [s: string | Chain]: string[];
}
const controller: TContract = {
  [CHAIN.ETHEREUM]: [
    '0x1c91da0223c763d2e0173243eadaa0a2ea47e704',
    '0xec0820efafc41d8943ee8de495fc9ba8495b15cf',
    '0xa920de414ea4ab66b97da1bfe9e6eca7d4219635',
    '0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67',
    '0x100daa78fc509db39ef7d04de0c1abd299f4c6ce',
    '0x8472a9a7632b173c8cf3a86d3afec50c35548e76'
  ]
}
const topic0 = '0x5393ab6ef9bb40d91d1b04bbbeb707fbf3d1eb73f46744e2d179e4996026283f';
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetchFees = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      const toTimestamp = timestamp
      const fromTimestamp = timestamp - 60 * 60 * 24
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const logs: ILog[] = (await Promise.all(controller[chain].map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0]
      })))).flat();
      const crvUSDAddress = `${CHAIN.ETHEREUM}:0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E`
      const prices = await getPrices([crvUSDAddress], timestamp);
      const crvUSDPrice = prices[crvUSDAddress]?.price || 1;
      const dailyFees = logs.reduce((acc: number, log: ILog) => {
        const data = log.data.replace('0x', '');
        const fee = (Number('0x' + data.slice(0, 64)) / 1e18) * crvUSDPrice;
        return acc + fee;
      },0)

      return {
        dailyFees: `${dailyFees}`,
        dailyHoldersRevenue: `${dailyFees}`,
        dailyRevenue: `${dailyFees}`,
        timestamp
      }
    } catch (e) {
      console.error(e)
      throw e;
    }
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: async () => 1684047600
    }
  }
}
export default adapters;
