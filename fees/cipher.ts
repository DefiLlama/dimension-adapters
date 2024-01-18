import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

const FriendtechSharesAddress = '0x2544a6412bc5aec279ea0f8d017fb4a9b6673dca';
const topic0_trade = '0x2c76e7a47fd53e2854856ac3f0a5f3ee40d15cfaa82266357ea9779c486ab9c3';
const event_trade = 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'
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

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
  try {
    // let _logs: ILog[] = [];
    // for(let i = fromBlock; i < toBlock; i += 10000) {
    //   const logs: ILog[] = (await sdk.getEventLogs({
    //     target: FriendtechSharesAddress,
    //     toBlock: i + 10000,
    //     fromBlock: i,
    //     chain: CHAIN.ARBITRUM,
    //     topics: [topic0_trade]
    //   }))as ILog[];
    //   console.log(logs.length)
    //   _logs = _logs.concat(logs);
    // }
    const logs: ILog[] = (await sdk.getEventLogs({
      target: FriendtechSharesAddress,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ARBITRUM,
      topics: [topic0_trade]
    })) as ILog[];

    const fees_details: IFee[] = logs.map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      const protocolEthAmount = Number(value!.args.protocolEthAmount) / 10 ** 18;
      const subjectEthAmount = Number(value!.args.subjectEthAmount) / 10 ** 18;
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
    [CHAIN.ARBITRUM]: {
        fetch: fetch,
        start: async ()  => 1695600000,
    },
  }
}

export default adapter;
