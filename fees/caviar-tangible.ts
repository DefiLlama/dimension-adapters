import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";

const topic0_evt_transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic1_evt_transfer = '0x000000000000000000000000bbc843dcb1009bc7dc988bceb5bb1b50299d9a6d';
const topic2_evt_transfer = '0x0000000000000000000000006ced48efbb581a141667d7487222e42a3fa17cf7';
const usdc = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24;
  try {
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.POLYGON, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.POLYGON, {}));

    const logs: ILog[] = (await sdk.getEventLogs({
      target: usdc,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.POLYGON,
      topics: [topic0_evt_transfer, topic1_evt_transfer, topic2_evt_transfer]
    })) as ILog[];
    const dailyFees = logs.reduce((acc: number, log: ILog) => {
      const amount = Number(log.data) / 10 ** 6;
      return acc + amount;
    }, 0);
    return {
      dailyFees: `${dailyFees}`,
      dailyHoldersRevenue: `${dailyFees}`,
      dailyRevenue: `${dailyFees}`,
      timestamp
    }
  } catch (error) {
    console.error(error)
    throw error;
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: async () => 1692144000,
    }
  }
}
export default adapter
