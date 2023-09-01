import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

const topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic1 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const topic2 = '0x000000000000000000000000fdce0267803c6a0d209d3721d2f01fd618e9cbf8';

const mkUSDAddress = '0x4591dbff62656e7859afe5e45f6f47d3669fbb28';

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
      const fromBlock = (await getBlock(fromTimestamp, CHAIN.ETHEREUM, {}));
      const toBlock = (await getBlock(toTimestamp, CHAIN.ETHEREUM, {}));
      const logs: ILog[] = (await sdk.api.util.getLogs({
        target: mkUSDAddress,
        topic: '',
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [topic0, topic1, topic2],
        keys: [],
        chain: CHAIN.ETHEREUM
      })).output as ILog[];

      const mkUSD = `${CHAIN.ETHEREUM}:${mkUSDAddress.toLowerCase()}`;
      const mkUSDPrice = (await getPrices([mkUSD], timestamp))[mkUSD]?.price | 1;
      const fees: number[] = logs.map((e: ILog) => {
        const amount = Number(e.data) / 10 ** 18;
        return amount;
      });

      const dailyFee = fees.reduce((a: number, b: number) => a+b, 0) * mkUSDPrice; // mkUSD
      return {
        dailyUserFees: dailyFee.toString(),
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.toString(),
        timestamp
      }
  } catch (error) {
    console.error(error);
    throw error;
  }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: async () => 1693440000,
    }
  }
}
export default adapter;
