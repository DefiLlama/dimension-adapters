import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"
import * as sdk from "@defillama/sdk"
import { ethers } from "ethers"
import { getPrices } from "../utils/prices"

const address = '0x20bc832ca081b91433ff6c17f85701b6e92486c5';
const topic0 = '0xb9c8611ba2eb0880a25df0ebde630048817ebee5f33710af0da51958c621ffd7';
const event = 'event RewardsUpdated(uint256 periodRewards,uint256 totalRewards,uint256 rewardPerToken,uint256 distributorReward,uint256 protocolReward)'
const contract_interface = new ethers.utils.Interface([
  event
]);

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.ETHEREUM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.ETHEREUM, {}));
    const logs: ILog[] = (await sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      topics: [topic0],
      chain: CHAIN.ETHEREUM
    })).output as ILog[]
    const rewardsUpdated = logs.map((log: ILog) => {
      const value = contract_interface.parseLog(log);
      return Number(value.args.periodRewards._hex) / 10 ** 18;
    }).reduce((a: number, b: number) => a + b, 0);
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const dailyFees = rewardsUpdated * ethPrice;
    const dailyRevenue = dailyFees * 0.1;
    const dailySupplySideRevenue = dailyFees * 0.9;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      dailySupplySideRevenue: `${dailySupplySideRevenue}`,
      timestamp
    }
  } catch (e) {
    console.error(e)
    throw e;
  }

}

const adapter: SimpleAdapter  = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: async () => 1641254400
    }
  }
}

export default adapter;
