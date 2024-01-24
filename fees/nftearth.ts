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
    const logs: ITx[] = (await sdk.getEventLogs({
      target: marketplace_address[chain],
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

    const ethAddress = chain !== CHAIN.POLYGON ? "ethereum:0x0000000000000000000000000000000000000000" : 'ethereum:0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0';
    const payableToken: string[] = logs.map((tx: ITx) => {
      const postionPayableToken = Number(tx.data.slice(320, 384)) === 1 ? 6 : 11;
      const address = tx.data.slice(postionPayableToken*64, (postionPayableToken*64)+64); // 11
      const contract_address = '0x' + address.slice(24, address.length);
      return `${chain}:${contract_address}`;
    });

    const prices = await getPrices([ethAddress, ...new Set(payableToken)], timestamp);
    const ethPrice = prices[ethAddress].price;



    const rawLogsData: ISaleData[] = logs.map((tx: ITx) => {
      const postionPayableToken = Number(tx.data.slice(320, 384)) === 1 ? 6 : 11;
      const address = tx.data.slice(postionPayableToken*64, (postionPayableToken*64)+64); // 11
      const contract_address = '0x' + address.slice(24, address.length);
      const thereIsNotCreatorFee = tx.data.length === 1280;
      const _price = prices[`${chain}:${contract_address}`]?.price || ethPrice;
      const _decimal = prices[`${chain}:${contract_address}`]?.decimals || 18;
      const amount = Number('0x' + tx.data.slice(832, 896)) / 10 **  _decimal; // 13

      const creator_fee =  (Number('0x' + tx.data.slice(1152, 1216)) / 10 **  _decimal) * _price; // 18
      const marketplace_fee =  (Number('0x' + tx.data.slice(1472, 1536)) / 10 **  _decimal) * _price; // 23

      return {
        amount: amount,
        contract_address: contract_address,
        creator_fee: thereIsNotCreatorFee ? 0 : creator_fee,
        marketplace_fee: thereIsNotCreatorFee ? creator_fee : marketplace_fee,
      }
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
