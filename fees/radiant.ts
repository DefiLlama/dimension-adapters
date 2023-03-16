import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic1 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const topic2 = '0x000000000000000000000000c2054a8c33bfce28de8af4af548c48915c455c13';

const contract_address = [
  '0x805ba50001779CeD4f59CfF63aea527D12B94829',
  '0x4cD44E6fCfA68bf797c65889c74B26b8C2e5d4d3',
  '0x15b53d277Af860f51c3E6843F8075007026BBb3a',
  '0x5293c6CA56b8941040b8D18f557dFA82cF520216',
  '0xEf47CCC71EC8941B67DC679D1a5f78fACfD0ec3C',
];

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}


const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs_transfer: ITx[][] = (await Promise.all(contract_address.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0, topic1, topic2],
      keys: [],
      chain: chain
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output);
    const tokens = [...new Set(contract_address.map((contract_address: string) => `${chain}:${contract_address.toLowerCase()}`))]
    const prices = await getPrices(tokens, timestamp);
    const feesAmuntsUSD: number[] = contract_address.map((contract_address: string, index: number) => {
      const logs = logs_transfer[index];
      const price = prices[ `${chain}:${contract_address.toLowerCase()}`].price;
      const decimals = prices[ `${chain}:${contract_address.toLowerCase()}`].decimals;
      return logs.map((tx: ITx) => {
          const amount = Number(tx.data);
          const amountUSD = (amount / 10 ** decimals) * price;
        return amountUSD;
      })
    }).flat();
    const dailyFee = feesAmuntsUSD.reduce((a: number, b: number) => a+b, 0);

    return {
      dailyFees: dailyFee.toString(),
      dailySupplySideRevenue: dailyFee.toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1675382400,
    },
  }
}

export default adapter;
