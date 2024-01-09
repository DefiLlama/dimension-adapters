import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

const FriendtechSharesAddress = '0xbc98176dc471cb67dc19fa4558104f034d8965fa';
const topic0_trade = '0xc9eb3cd369a1da18b8489f028fd6a49d0aca6d6ad28c01fe1451126ce41a7fa4';
const event_trade = 'event Trade(address trader,uint256 channelId,bool isBuy,uint256 shareAmount,uint256 totalShares,uint256 ethAmount,uint256 protocolEthAmount,uint256 channelEthAmount,uint256 totalSupply,uint256 channelFeePerShare)'
const contract_interface = new ethers.Interface([
  event_trade
]);

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IFee {
  fees: number;
  rev: number;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.BASE, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.BASE, {}));
  try {
    let _logs: ILog[] = [];
    for(let i = fromBlock; i < toBlock; i += 5000) {
      const logs: ILog[] = (await sdk.getEventLogs({
        target: FriendtechSharesAddress,
        toBlock: i + 5000,
        fromBlock: i,
        chain: CHAIN.BASE,
        topics: [topic0_trade]
      })) as ILog[];
      _logs = _logs.concat(logs);
    }

    const fees_details: IFee[] = _logs.map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      const protocolEthAmount = Number(value!.args.protocolEthAmount) / 10 ** 18;
      const subjectEthAmount = Number(value!.args.channelEthAmount) / 10 ** 18;
      return {
        fees: protocolEthAmount + subjectEthAmount,
        rev: protocolEthAmount
      } as IFee
    })
    const dailyFees = fees_details.reduce((a: number, b: IFee) => a+b.fees, 0)
    const dailyRev = fees_details.reduce((a: number, b: IFee) => a+b.rev, 0)
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const dailyFeesUSD = (dailyFees) * ethPrice;
    const dailyRevUSD = (dailyRev) * ethPrice;
    return {
      dailyFees: `${dailyFeesUSD}`,
      dailyRevenue: `${dailyRevUSD}`,
      timestamp
    }
  } catch (error) {
    console.error(error)
    throw error;
  }

}


const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
        fetch: fetch,
        start: async ()  => 1696204800,
    },
  }
}

export default adapter;
