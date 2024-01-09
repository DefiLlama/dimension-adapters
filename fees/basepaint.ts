import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"
import { ethers } from "ethers"
import { getPrices } from "../utils/prices"
import * as sdk from "@defillama/sdk"

const topic_0 = '0x1033721d007e6103a21cb6edd862fc6eb6a601285ee27d595c4d9f9e597a1837'
const contract = '0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83'
const event = 'event ArtistsEarned(uint256 indexed day,uint256 amount)';
const protocol_fees = 10; // 10% fees


const contract_interface = new ethers.Interface([

])
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.BASE, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.BASE, {}));
    const logs = (await sdk.getEventLogs({
      target: contract,
      topic: topic_0,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.BASE,
      topics: [topic_0]
    })) as ILog[];

    const artic_fees = logs.map((e: ILog) => {
      const amount = Number(e.data) / 10 ** 18;
      return amount;
    });

    const artic_fees_amount = artic_fees.reduce((a: number, b: number) => a + b, 0);
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;

    const dailyFees = (artic_fees_amount / ((100 - 10)/100)) * ethPrice;
    const dailyRevenue  = dailyFees * (protocol_fees/100);

    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (error) {
    console.error(error)
    throw error;
  }
}

const adapterFees: SimpleAdapter  = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: async ()  => 1691625600,
    }
  }
}

export default adapterFees;
