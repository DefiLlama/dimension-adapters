import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { ethers } from "ethers";

const FriendV1Address = '0x1e70972ec6c8a3fae3ac34c9f3818ec46eb3bd5d';
const topic0_trade = '0x2c76e7a47fd53e2854856ac3f0a5f3ee40d15cfaa82266357ea9779c486ab9c3';
const event_trade = 'event Trade(address trader, address subject, bool isBuy, uint256 ticketAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'
const contract_interface = new ethers.Interface([
  event_trade
]);


const FriendV2Address = '0x2C5bF6f0953ffcDE678A35AB7d6CaEBC8B6b29F0';
const topic0_trade_V2 = '0x5acb97638a46771a62aed2578c5c5c260108ffe0c606b887d61a9057af4034c9';
const event_trade_V2 = 'event Trade (address trader , bytes32 subjectId , bool isBuy , uint256 ticketAmount , uint256 tokenAmount , uint256 protocolAmount , uint256 subjectAmount , uint256 holderAmount , uint256 referralAmount , uint256 supply)'
const contract_interface_V2 = new ethers.Interface([
  event_trade_V2
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

  try {
    const fromBlock = await getBlock(fromTimestamp, CHAIN.BSC, {});
    const toBlock = await getBlock(toTimestamp, CHAIN.BSC, {});


    let _logs: ILog[] = [];
    for(let i = fromBlock; i < toBlock; i += 5000) {
      const logs: ILog[] = (await sdk.getEventLogs({
        target: FriendV1Address,
        toBlock: i + 5000,
        fromBlock: i,
        chain: CHAIN.BSC,
        topics: [topic0_trade]
      })) as ILog[];
      _logs = _logs.concat(logs);
    }

    const fees_details: IFee[] = _logs.map((e: ILog) => {
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
    const ethAddress = "bsc:0x0000000000000000000000000000000000000000";
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

const fetchOpbnb = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  try {
    const fromBlock = await getBlock(fromTimestamp, CHAIN.OP_BNB, {});
    const toBlock = await getBlock(toTimestamp, CHAIN.OP_BNB, {});


    let _logs: ILog[] = [];
    for(let i = fromBlock; i < toBlock; i += 3400) {
      try {
        const logs: ILog[] = (await sdk.getEventLogs({
          target: FriendV2Address,
          toBlock: i + 3400,
          fromBlock: i,
          chain: CHAIN.OP_BNB,
          topics: [topic0_trade_V2]
        })) as ILog[];
        _logs = _logs.concat(logs);
      } catch (error) {
        // console.error(error)
        // skip error
      }
    }

    const fees_details: IFee[] = _logs.map((e: ILog) => {
      const value = contract_interface_V2.parseLog(e);
      const protocolAmount = Number(value!.args.protocolAmount) / 10 ** 18;
      const subjectAmount = Number(value!.args.subjectAmount) / 10 ** 18;
      const holderAmount = Number(value!.args.holderAmount) / 10 ** 18;
      const referralAmount = Number(value!.args.referralAmount) / 10 ** 18;
      return {
        fees: protocolAmount + subjectAmount + holderAmount,
        rev: protocolAmount-referralAmount
      } as IFee
    })
    const dailyFees = fees_details.reduce((a: number, b: IFee) => a+b.fees, 0)
    const dailyRev = fees_details.reduce((a: number, b: IFee) => a+b.rev, 0)
    const ethAddress = "op_bnb:0x0000000000000000000000000000000000000000";
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
    [CHAIN.BSC]: {
        fetch: fetch,
        start: async ()  => 1692835200,
    },
    [CHAIN.OP_BNB]: {
      fetch: fetchOpbnb,
      start: async ()  => 1698710400,
  },
  }
}

export default adapter;
