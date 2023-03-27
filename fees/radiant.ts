import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { type } from "os";

const middleFees = '0xE10997B8d5C6e8b660451f61accF4BBA00bc901f';
const topic0NewTransferAdded = '0xc5e1cdb94ac0a9f4f65e1a23fd59354025cffdf472eb03020ac4ba0e92d9969f';
type TMapToken = {
  [st: string]: string;
}
const mapToken: TMapToken = {
  '0x0d914606f3424804fa1bbbe56ccc3416733acec6': '0x5293c6CA56b8941040b8D18f557dFA82cF520216',
  '0x48a29e756cc1c097388f3b2f3b570ed270423b3d': '0x805ba50001779CeD4f59CfF63aea527D12B94829',
  '0xd69d402d1bdb9a2b8c3d88d98b9ceaf9e4cd72d9': '0xEf47CCC71EC8941B67DC679D1a5f78fACfD0ec3C',
  '0x0df5dfd95966753f01cb80e76dc20ea958238c46': '0x15b53d277Af860f51c3E6843F8075007026BBb3a',
  '0x727354712bdfcd8596a3852fd2065b3c34f4f770': '0x4cD44E6fCfA68bf797c65889c74B26b8C2e5d4d3'
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
    const tokens = [...new Set(raw_data_logs.map((e: IData) => `${chain}:${mapToken[e.contract_address.toLowerCase()].toLowerCase()}`))]
    const prices = await getPrices(tokens, timestamp);
    const feesAmuntsUSD: any[] = raw_data_logs.map((d: any) => {
      const price = prices[`${chain}:${mapToken[d.contract_address.toLowerCase()].toLowerCase()}`].price;
      const decimals = prices[`${chain}:${mapToken[d.contract_address.toLowerCase()].toLowerCase()}`].decimals;
      return {amount: d.amount / 10 ** decimals, tx: d.tx, a: d.contract_address}
    });
    console.log(feesAmuntsUSD)
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
