import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";

import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
const address  = "0x0000000000e655fae4d56241588680f86e3b2377";
const topic0_taker_bid = "0x3ee3de4684413690dee6fff1a0a4f92916a1b97d1c5a83cdf24671844306b2e3";
const topic0_taker_ask = "0x9aaa45d6db2ef74ead0751ea9113263d1dec1b50cea05f0ca2002cb8063564a4";

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}

const graphs = (chain: Chain) => {
  return async (timestamp: number) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

    const logs_bid: ITx[] = (await sdk.getEventLogs({
      target: address,
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_taker_bid],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash, topics: e.topics } as ITx})

    const logs_ask: ITx[] = (await sdk.getEventLogs({
      target: address,
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_taker_ask],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash, topics: e.topics } as ITx})
    const logs = logs_bid.concat(logs_ask)

    const rawLogsData: number[] = logs.map((tx: ITx) => {
      const amount = Number('0x' + tx.data.slice(896, 960)) / 10 **  18;
      return amount;
    });

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const dailyFee = rawLogsData.reduce((a: number, b: number) => a+b, 0);
    const dailyFeeUSD = dailyFee * ethPrice;
    return {
      timestamp,
      dailyFees: dailyFeeUSD.toString(),
      dailyRevenue: dailyFeeUSD.toString(),
      dailyHoldersRevenue: dailyFeeUSD.toString(),
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
        fetch: graphs(ETHEREUM),
        start: async ()  => 1640775864,
    },
  }
}

export default adapter;
