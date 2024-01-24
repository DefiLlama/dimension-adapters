import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"
import * as sdk from "@defillama/sdk"
import { ethers } from "ethers"
import { getPrices } from "../utils/prices"

const reth2Address = '0x20bc832ca081b91433ff6c17f85701b6e92486c5';
const reth2Topic = '0xb9c8611ba2eb0880a25df0ebde630048817ebee5f33710af0da51958c621ffd7';
const reth2Interface = new ethers.Interface([
  'event RewardsUpdated(uint256 periodRewards,uint256 totalRewards,uint256 rewardPerToken,uint256 distributorReward,uint256 protocolReward)'
]);

const osTokenCtrlAddress = '0x2A261e60FB14586B474C208b1B7AC6D0f5000306';
const osTokenCtrlTopic = '0xb27a3a9979877b12952e21e91eeded34f5ecc7d5147544ca7b58fa9cd85e30be'
const osTokenCtrlInterface = new ethers.Interface([
  'event StateUpdated(uint256 profitAccrued,uint256 treasuryShares,uint256 treasuryAssets)'
]);
const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";

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

    // fetch rETH2 logs
    let logs: ILog[] = (await sdk.getEventLogs({
      target: reth2Address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      topics: [reth2Topic],
      chain: CHAIN.ETHEREUM
    })) as ILog[]
    const rEth2Rewards = logs.map((log: ILog) => {
      const value = reth2Interface.parseLog(log);
      return Number(value!.args.periodRewards) / 10 ** 18;
    }).reduce((a: number, b: number) => a + b, 0);

    // fetch osETH logs
    logs = (await sdk.getEventLogs({
      target: osTokenCtrlAddress,
      toBlock: toBlock,
      fromBlock: fromBlock,
      topics: [osTokenCtrlTopic],
      chain: CHAIN.ETHEREUM
    })) as ILog[]
    const osEthRewards = logs.map((log: ILog) => {
      const value = osTokenCtrlInterface.parseLog(log);
      return Number(value!.args.profitAccrued) / 10 ** 18;
    }).reduce((a: number, b: number) => a + b, 0);

    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    let dailyFees = (osEthRewards + rEth2Rewards) * ethPrice;
    const dailyRevenue = ((osEthRewards * 0.05) + (rEth2Rewards * 0.1)) * ethPrice;
    const dailySupplySideRevenue = ((osEthRewards * 0.95) + (rEth2Rewards * 0.9)) * ethPrice;
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
