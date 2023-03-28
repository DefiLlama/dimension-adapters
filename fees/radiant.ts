import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const middleFees = '0xE10997B8d5C6e8b660451f61accF4BBA00bc901f';
const topic0NewTransferAdded = '0xc5e1cdb94ac0a9f4f65e1a23fd59354025cffdf472eb03020ac4ba0e92d9969f';
type TMapToken = {
  [st: string]: string;
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
    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: middleFees,
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0NewTransferAdded],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash, topics: e.topics } as ITx});
    const raw_data_logs: IData[] = logs.map((tx: ITx) => {
      const amount = Number('0x'+tx.data);
      const address = tx.topics[1];
      const contract_address = '0x' + address.slice(26, address.length);
      return {
        amount,
        contract_address,
        tx: tx.transactionHash
      };
    })
    const feesAmuntsUSD: any[] = raw_data_logs.map((d: any) => {
      return {amount: d.amount / 10 ** 18, tx: d.tx, a: d.contract_address} // debug
    });
    const dailyFee = feesAmuntsUSD.reduce((a: number, b: any) => a+b.amount, 0);

    return {
      dailyFees: dailyFee.toString(),
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
