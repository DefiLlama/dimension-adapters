import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

const friendRoomSharesAddress = '0x9BD0474CC4F118efe56f9f781AA8f0F03D4e7A9c';
const topic0_trade = '0x68e42cc58cdc03b82d6c135e12e98660f43a75ce1ccfb1a625965e253f50d7b0';
const event_trade = 'event Trade(uint256 index, uint256 serverId, address trader, uint256 tokenId, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'
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

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ETHEREUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ETHEREUM, {}));
  try {
    const logs: ILog[] = (await sdk.getEventLogs({
      target: friendRoomSharesAddress,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ETHEREUM,
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
    [CHAIN.ETHEREUM]: {
        fetch: fetch,
        start: async ()  => 1693731179,
    },
  }
}

export default adapter;
