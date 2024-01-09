import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { ethers } from "ethers";

const address = '0x563395a2a04a7ae0421d34d62ae67623caf67d03';
const topic0_trade = '0xc9d4f93ded9b42fa24561e02b2a40f720f71601eb1b3f7b3fd4eff20877639ee';
const event_trade = 'event Trade(address trader,address subject,bool isBuy,uint256 shareAmount,uint256 amount,uint256 protocolAmount,uint256 subjectAmount,uint256 referralAmount,uint256 supply,uint256 buyPrice,uint256 myShares)'
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

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.AVAX, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.AVAX, {}));
  try {
    let _logs: ILog[] = [];
    for(let i = fromBlock; i < toBlock; i += 5000) {
      const logs: ILog[] = (await sdk.getEventLogs({
        target: address,
        toBlock: i + 5000,
        fromBlock: i,
        chain: CHAIN.AVAX,
        topics: [topic0_trade]
      })) as ILog[];
      _logs = _logs.concat(logs);
    }

    const fees_details: IFee[] = _logs.map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      const protocolEthAmount = Number(value!.args.protocolAmount) / 10 ** 18;
      const subjectEthAmount = Number(value!.args.subjectAmount) / 10 ** 18;
      return {
        fees: protocolEthAmount + subjectEthAmount,
        rev: protocolEthAmount
      } as IFee
    })
    const dailyFees = fees_details.reduce((a: number, b: IFee) => a+b.fees, 0)
    const dailyRev = fees_details.reduce((a: number, b: IFee) => a+b.rev, 0)
    const avaxPrice = "avax:0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
    const ethPrice = (await getPrices([avaxPrice], timestamp))[avaxPrice].price;
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
    [CHAIN.AVAX]: {
        fetch: fetch,
        start: async ()  => 1695081600,
    },
  }
}

export default adapter;
