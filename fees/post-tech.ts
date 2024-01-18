import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"
import { ethers } from "ethers"
import * as sdk from "@defillama/sdk"
import { getPrices } from "../utils/prices"

const contract_address = '0x87da6930626fe0c7db8bc15587ec0e410937e5dc'
const topic0_trade = '0xd5bfddbe72aa2c9b73b3fe3ad6d90e4dc2bb1b80d51272e831927c33f587a441'
const event_trade = 'event Trade(address trader,address subject,bool isBuy,uint256 shareAmount,uint256 ethAmount,uint256 protocolEthAmount,uint256 subjectEthAmount,uint256 holderEthAmount,uint256 referralEthAmount,uint256 supply)';

const contract_interface = new ethers.Interface([
  event_trade
])
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IFee {
  fees: number;
  rev: number;
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const fromBlock = await getBlock(fromTimestamp, CHAIN.ARBITRUM, {});
    const toBlock = await getBlock(toTimestamp, CHAIN.ARBITRUM, {});

    const logs = (await sdk.getEventLogs({
      target: contract_address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ARBITRUM,
      topics: [topic0_trade]
    })) as ILog[];

    const fees_details = logs.map((e: ILog) => {
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
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: async () => 1693267200
    }
  }
}

export default adapter;
