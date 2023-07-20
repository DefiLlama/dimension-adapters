import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

const contract_address = '0x5bBe36152d3CD3eB7183A82470b39b29EedF068B';
const topic0 = '0x7e4199a81d431b89a16814e8730ae102c7b9b30c1a661bc67be86f4b185b1733';

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ETHEREUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ETHEREUM, {}));
  const logs: ILog[] = (await sdk.api.util.getLogs({
    target: contract_address,
    topic: '',
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0],
    keys: [],
    chain: CHAIN.ETHEREUM
  })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ILog});
  const fees: number = logs.map((tx: ILog) => {
    const amountHETH = Number('0x' + tx.data.slice(64, 128)) / 10 **  18;
    const amountETHForMintingCalc = Number('0x' + tx.data.slice(128, 192)) / 10 **  18;
    const diffExecLayerRewardsForFeelCalc = Number('0x' + tx.data.slice(192, 256)) / 10 **  18;
    return amountHETH + amountETHForMintingCalc;
  }).reduce((a: number, b: number) => a + b, 0);

  const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
  const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
  const dailyFees = fees * ethPrice;
  const dailyRevenue = dailyFees;
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    timestamp
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: async () => 1675814400,
    },
  }
};

export default adapter;
