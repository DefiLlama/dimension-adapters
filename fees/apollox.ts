import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers,  } from "ethers";

const event_swap = 'event FundingFeeAddLiquidity(address indexed token, uint256 amount)';
const topic0 = '0xb0faf9d95bf9da91b484b80f15f870aa692d8b2480c3815dc994b1d7a85c3052';

const contract_interface = new ethers.utils.Interface([
  event_swap
]);
interface IData {
  token: string;
  amount: number;
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const address = '0x1b6f2d3844c6ae7d56ceb3c3643b9060ba28feb0'
const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp

    try {
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));
      const logs: ILog[] = (await sdk.api.util.getLogs({
        target: address,
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic0]
      })).output as ILog[];
      const raw_data: IData[] = logs.map((e: ILog) => {
        const value = contract_interface.parseLog(e);
        return {
          token: value.args.token,
          amount: Number(value.args.amount._hex)
        } as IData
      })
      const coins = [...new Set(raw_data.map((e: IData) => `${chain}:${e.token.toLowerCase()}`))]
      const prices = await getPrices(coins, timestamp);
      const dailyFees = raw_data.map((e: IData) => {
        const price = prices[`${chain}:${e.token.toLowerCase()}`].price;
        const decimals = prices[`${chain}:${e.token.toLowerCase()}`].decimals;
        return (Number(e.amount) / 10 ** decimals) * price;
      }).reduce((a: number, b: number) => a + b, 0);
      const dailySupplySideRevenue = dailyFees * .5;
      const dailyRevenue = dailyFees * .5;
      return {
        dailyFees: `${dailyFees}`,
        dailySupplySideRevenue: `${dailySupplySideRevenue}`,
        dailyRevenue: `${dailyRevenue}`,
        timestamp
      }
    } catch(error) {
      console.error(error);
      throw error;
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async () => 1684800000,
    },
  }
};

export default adapter;
