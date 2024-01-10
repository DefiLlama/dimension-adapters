import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0x5548c837ab068cf56a2c2479df0882a4922fd203edb7517321831d95078c5f62';

type TMarketPlaceAddress = {
  [l: string | Chain]: string;
}
const marketplace_address: TMarketPlaceAddress = {
  [CHAIN.ETHEREUM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.BSC]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.AVAX]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.MOONBEAM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.FANTOM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.POLYGON]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  // [CHAIN.XDAI]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.OPTIMISM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
}

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IData {
  contract_address: string;
  amount: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.getEventLogs({
      target: marketplace_address[chain],
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash, topics: e.topics } as ITx});


    const rawLogsData: IData[] = logs.map((tx: ITx) => {
      const amount = Number('0x' + tx.data);
      const address = tx.topics[2];
      const contract_address = '0x' + address.slice(26, address.length);
      return {
        amount: amount,
        contract_address: contract_address
      } as IData
    });
    const tokens = [...new Set(rawLogsData.map((e: IData) => `${chain}:${e.contract_address.toLowerCase()}`))]
    const prices = await getPrices(tokens, timestamp);
    const feesAmounts: number[] = rawLogsData.map((e: IData) => {
      const price = prices[`${chain}:${e.contract_address.toLowerCase()}`].price;
      const decimals = prices[`${chain}:${e.contract_address.toLowerCase()}`].decimals;
      return (e.amount / 10 ** decimals) * price;
    })
    const dailyFees = feesAmounts.reduce((a: number, b: number) => a+b,0);
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyFees.toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: async ()  => 1675382400,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async ()  => 1675382400,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async ()  => 1675382400,
    },
    [CHAIN.MOONBEAM]: {
      fetch: fetch(CHAIN.MOONBEAM),
      start: async ()  => 1675382400,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async ()  => 1675382400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async ()  => 1675382400,
    },
    // [CHAIN.XDAI]: {
    //   fetch: fetch(CHAIN.XDAI),
    //   start: async ()  => 1675382400,
    // },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async ()  => 1675382400,
    }
  }
}

export default adapter;
