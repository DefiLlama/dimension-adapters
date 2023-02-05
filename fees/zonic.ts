import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const OPTIMISM_ADDRESS = '0x0d32748b617e6c9fc3b505b0e8d0a897c69e56e8';
const topic0 = '0x6961098fee108da07c31a03d7cdf81c188ac73f57eeebbade85cc61e35f28488';
const MarketplaceFee: number = 2.5;

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

type Fee = {
  [l: string]: number;
}
type TCreatorFee = {
  [k: string | Chain]: Fee;
}

const map_creator_fee: TCreatorFee = {
  [CHAIN.OPTIMISM]: {
    '0x51e5426ede4e2d4c2586371372313b5782387222': 2.5,
    '0x8e56343adafa62dac9c9a8ac8c742851b0fb8b03': 10,
    '0x9b9f542456ad12796ccb8eb6644f29e3314e68e1': 5,
    '0x812053625db6b8fbd282f8e269413a6dd59724c9': 10,
  }
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: OPTIMISM_ADDRESS,
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

    const rawLogsData: ISaleData[] = logs.map((tx: ITx) => {
      const amount = Number('0x' + tx.data.slice(320, 384)) / 10 **  18;
      const address = tx.data.slice(128, 192);
      const contract_address = '0x' + address.slice(24, address.length);
      return {
        amount: amount,
        contract_address: contract_address,
        creator_fee: ((map_creator_fee[chain][contract_address] || 0)/100) * amount,
        marketplace_fee:  (MarketplaceFee / 100) * amount
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
  }
}

export default adapter;
