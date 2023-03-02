import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31';
const topic1 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

type TMarketPlaceAddress = {
  [l: string | Chain]: string;
}
const marketplace_address: TMarketPlaceAddress = {
  [CHAIN.OPTIMISM]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901',
  [CHAIN.ARBITRUM]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901',
  [CHAIN.POLYGON]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901'
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

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethOptimism ="optimism:0x4200000000000000000000000000000000000006";
    const l2dao = "optimism:0xd52f94df742a6f4b4c8b033369fe13a41782bf44";
    const op = "optimism:0x4200000000000000000000000000000000000042";
    const nfteOptimism = "optimism:0xc96f4F893286137aC17e07Ae7F217fFca5db3AB6";
    const nfteArbitrum = "arbitrum:0xb261104a83887ae92392fb5ce5899fcfe5481456";
    const prices = await getPrices([ethAddress, l2dao, op, nfteOptimism, nfteArbitrum, ethOptimism], timestamp);
    const ethPrice = prices[ethAddress].price;
    const l2daoPrice = prices[l2dao].price;
    const opPrice = prices[op].price;
    const nfteOptimismPrice = prices[nfteOptimism].price
    const nfteArbitrumPrice = prices[nfteArbitrum].price
    const ethOptimismPrice = prices[ethOptimism].price

    const rawLogsData: ISaleData[] = logs.map((tx: ITx) => {
      const address = tx.data.slice(704, 768); // 11
      const contract_address = '0x' + address.slice(24, address.length);
      const thereIsNotCreatorFee = tx.data.length === 1280;
      const amount = Number('0x' + tx.data.slice(832, 896)) / 10 **  18; // 13
      const _price = contract_address === '0x0000000000000000000000000000000000000000' ? ethOptimismPrice : opPrice;
      const creator_fee =  (Number('0x' + tx.data.slice(1152, 1216)) / 10 **  18) * _price; // 18
      const marketplace_fee =  (Number('0x' + tx.data.slice(1472, 1536)) / 10 **  18) * _price; // 23

      return {
        amount: amount,
        contract_address: contract_address,
        creator_fee: thereIsNotCreatorFee ? 0 : creator_fee,
        marketplace_fee: thereIsNotCreatorFee ? creator_fee : marketplace_fee,
      } as ISaleData
    });


    const marketplace_fee = rawLogsData.reduce((a: number, b: ISaleData) => a + b.marketplace_fee, 0);
    const creator_fee = rawLogsData.reduce((a: number, b: ISaleData) => a + b.creator_fee, 0);
    const dailyFees = (marketplace_fee + creator_fee);
    const dailyRevenue = (marketplace_fee);
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
        start: async ()  => 1675036800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1676332800,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async ()  => 1675036800,
  },
  }
}

export default adapter;
