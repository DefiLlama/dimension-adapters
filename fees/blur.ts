import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";
import BigNumber from "bignumber.js";
import { Chain } from "@defillama/sdk/build/general";
import { getPrices } from "../utils/prices";


interface ITx {
  data: string;
}
interface IFee {
  feeRate: string;
  volume: number;
}

const topics = '0x61cbb2a3dee0b6064c2e681aadd61677fb4ef319f0b547508d495626f5a62f64';
const MarketplaceAddress = "0x000000000000ad05ccc4f10045630fb830b95127";
const FEE_ADDRESS = {
  [CHAIN.ETHEREUM]: MarketplaceAddress,
};

const fetch = (address: string, chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
    const todaysBlock = (await getBlock(todaysTimestamp, chain, {}));
    const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const log: IFee[] = (await sdk.api.util.getLogs({
      target: address,
      topic: topics,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: chain,
      topics: [topics]
    })).output
      .map((e:any) => {return { data: e.data.replace('0x', '') } as ITx})
      .map((p: ITx) => {
          const volume = new BigNumber('0x'+p.data.slice(704, 768)).toString();
          const feeRate = new BigNumber('0x'+p.data.slice(1152, 1216)).toString();
        return {
          volume: Number(volume) / 10 ** 18,
          feeRate: feeRate,
        } as IFee
      });
    const dailyFees = log
      .filter(e => e.feeRate !== '0')
      .reduce((p: number , c: IFee) => p + (((Number(c.feeRate)/100)/100) * c.volume), 0);
    const prices = await getPrices(['coingecko:ethereum'], todaysTimestamp);
    const ethPrice = prices['coingecko:ethereum'].price;
    const dailyFeesUsd = dailyFees * ethPrice;
    return {
      timestamp,
      dailyFees: dailyFeesUsd.toString(),
    } as FetchResultFees
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(FEE_ADDRESS[CHAIN.ETHEREUM], CHAIN.ETHEREUM),
        start: async ()  => 1669852800,
    },
  }
}

export default adapter;
