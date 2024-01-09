import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains"
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";

const topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic2 = '0x0000000000000000000000006ced48efbb581a141667d7487222e42a3fa17cf7'
const usdc = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'
const list_from_addres_hex = [
  '0x00000000000000000000000043e656716cf49c008435a8196d8f825f66f37254',
  '0x000000000000000000000000cb7daa45ed2a9253ad3c900583b33bed822e8283',
  '0x00000000000000000000000049c7371daecb7f06fc7303a14ab80174453df4cf',
];
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24;
  try {
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.POLYGON, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.POLYGON, {}));
    const logs: ILog[] = (await Promise.all(list_from_addres_hex.map((topic1: string) => sdk.getEventLogs({
      target: usdc,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.POLYGON,
      topics: [topic0, topic1, topic2]
    })))).flat();
    const dailyFees = logs.map((e: ILog) => {
      const value = Number(e.data) / 10 ** 6;
      return value;
    }).reduce((a: number, b: number) => a + b, 0)

    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyFees}`,
      timestamp
    }
  } catch  (error) {
    console.error(error);
    throw error;
  }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: async () => 1682899200,
    }
  }
}
export default adapter;
