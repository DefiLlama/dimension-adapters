import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31';

type TMarketPlaceAddress = {
  [l: string | Chain]: string;
}
const marketplace_address: TMarketPlaceAddress = {
  [CHAIN.OPTIMISM]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901',
  [CHAIN.ARBITRUM]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901',
  
}

interface ITx {
  data: string;
  transactionHash: string;
}

interface ISaleData {
  contract_address: string;
  amount: number;
  creator_fee: number;
  marketplace_fee: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: marketplace_address[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

    const rawLogsData: ISaleData[] = logs.map((tx: ITx) => {
      const amount = Number('0x' + tx.data.slice(320, 384)) / 10 **  18;
      const creator_fee =  Number('0x' + tx.data.slice(384, 448)) / 10 **  18;
      const marketplace_fee =  Number('0x' + tx.data.slice(448, 512)) / 10 **  18;
      const address = tx.data.slice(128, 192);
      const contract_address = '0x' + address.slice(24, address.length);
      return {
        amount: amount,
        contract_address: contract_address,
        creator_fee: creator_fee,
        marketplace_fee: marketplace_fee
      } as ISaleData
    });

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const marketplace_fee = rawLogsData.reduce((a: number, b: ISaleData) => a+b.marketplace_fee, 0);
    const creator_fee = rawLogsData.reduce((a: number, b: ISaleData) => a+b.creator_fee, 0);
    const dailyFees = (marketplace_fee + creator_fee) * ethPrice;
    const dailyRevenue = (marketplace_fee) * ethPrice;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM),
        start: async ()  => 1675382400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1675382400,
},
  }
}

export default adapter;
