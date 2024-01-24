import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0x31d8f0f884ca359b1c76fda3fd0e25e5f67c2a5082158630f6f3900cb27de467';

type TMarketPlaceAddress = {
  [l: string | Chain]: string;
}
const marketplace_address: TMarketPlaceAddress = {
  [CHAIN.OPTIMISM]: '0x11c9e50dfde606a864a25726d174faf947626f3d',
  [CHAIN.ARBITRUM]: '0x1A7b46C660603EBB5FBe3AE51e80AD21dF00bDd1',
  [CHAIN.ARBITRUM_NOVA]: '0x1a7b46c660603ebb5fbe3ae51e80ad21df00bdd1',
  [CHAIN.ERA]: '0xf7Ce7998B4c8aFc97a15c32E724ae2C0D0F90F73',
  [CHAIN.POLYGON_ZKEVM]: '0x1a7b46c660603ebb5fbe3ae51e80ad21df00bdd1',
  [CHAIN.BASE]: '0xdc7d3f21132e7fa9df6602a6e87fcbd49183a728',
  [CHAIN.LINEA]: '0x1A7b46C660603EBB5FBe3AE51e80AD21dF00bDd1'
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
    [CHAIN.ARBITRUM_NOVA]: {
      fetch: fetch(CHAIN.ARBITRUM_NOVA),
      start: async ()  => 1675382400,
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: async ()  => 1679961600,
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetch(CHAIN.POLYGON_ZKEVM),
      start: async ()  => 1679961600,
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: async ()  => 1692662400,
    },
    [CHAIN.LINEA]: {
      fetch: fetch(CHAIN.LINEA),
      start: async ()  => 1692662400,
    }
  }
}

export default adapter;
