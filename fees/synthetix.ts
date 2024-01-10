import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from '@defillama/sdk/build/general';
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";


const methodology = {
  UserFees: "Users pay between 10-100 bps (0.1%-1%), usually 30 bps, whenever they exchange a synthetic asset (Synth)",
  HoldersRevenue: "Fees are granted proportionally to SNX stakers by automatically burning outstanding debt (note: rewards not included here can also be claimed by SNX stakers)",
  Revenue: "Fees paid by users and awarded to SNX stakers",
  Fees: "Fees generated on each synthetic asset exchange, between 0.1% and 1% (usually 0.3%)",
}

const topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic1 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const topic2 = '0x000000000000000000000000feefeefeefeefeefeefeefeefeefeefeefeefeef';

type IContract = {
  [l: string | Chain]: string;
}
const contract_address: IContract = {
  [CHAIN.ETHEREUM]: '0x57ab1ec28d129707052df4df418d58a2d46d5f51',
  [CHAIN.OPTIMISM]: '0x8c6f28f2f1a3c87f0f938b96d27520d9751ec8d9'
}
interface ITx {
  data: string;
  transactionHash: string;
}
interface IFee {
  amount: number;
}

const graphs = () => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

      const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
      const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
      const logs: ITx[] = (await sdk.getEventLogs({
        target: contract_address[chain],
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [topic0, topic1, topic2],
        chain: chain
      })).map((e: any) => { return { data: e.data, transactionHash: e.transactionHash } as ITx});

      const sUSD = `${chain}:${contract_address[chain].toLowerCase()}`;
      const sUSDPrice = (await getPrices([sUSD], timestamp))[sUSD].price;
      const fees = logs.map((e: ITx) => {
        const amount = Number(e.data) / 10 ** 18;
        return {
          amount: amount
        } as IFee;
      });

      const dailyFee = fees.reduce((a: number, b: IFee) => a+b.amount, 0) * sUSDPrice; // sUSD

      return {
        timestamp,
        dailyUserFees: dailyFee.toString(),
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.toString(),
        dailyHoldersRevenue: dailyFee.toString()
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs()(CHAIN.ETHEREUM),
      start: async () => 1653523200,
      meta: {
        methodology
      }
    },
    [CHAIN.OPTIMISM]: {
      fetch: graphs()(CHAIN.OPTIMISM),
      start: async () => 1636606800,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
