import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0xa07a543ab8a018198e99ca0184c93fe9050a79400a0a723441f84de1d972cc17';

type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  [CHAIN.XDAI]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41'
}

interface ITx {
  data: string;
  transactionHash: string;
}

interface ISaleData {
  contract_address: string;
  amount: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: address[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

    const rawLogsData: ISaleData[] = logs.map((tx: ITx) => {
      const amount = Number('0x' + tx.data.slice(256, 320));
      const address = tx.data.slice(0, 64);
      const contract_address = '0x' + address.slice(24, address.length);
      return {
        amount: amount,
        contract_address: contract_address,
      } as ISaleData
    });

    const tokens = [...new Set(rawLogsData.map((e: ISaleData) => `${chain}:${e.contract_address}`))]
    const prices = (await getPrices(tokens, timestamp));
    const amounts = rawLogsData.map((e: ISaleData) => {
      const price = prices[`${chain}:${e.contract_address}`]?.price || 0;
      const decimals = prices[`${chain}:${e.contract_address}`]?.decimals || 0;
      return (e.amount / 10 ** decimals) * price;
    });
    const dailyFees = amounts.reduce((a: number, b: number) => a+b, 0);
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
    [CHAIN.XDAI]: {
      fetch: fetch(CHAIN.XDAI),
      start: async ()  => 1675382400,
  },
  }
}

export default adapter;
