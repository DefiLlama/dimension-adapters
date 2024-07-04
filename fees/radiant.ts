import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0NewTransferAdded = '0xc5e1cdb94ac0a9f4f65e1a23fd59354025cffdf472eb03020ac4ba0e92d9969f';

type TAddress = {
  [l: string | Chain]: string;
}

const address: TAddress  = {
  [CHAIN.ARBITRUM]: '0xE10997B8d5C6e8b660451f61accF4BBA00bc901f',
  [CHAIN.BSC]: '0xcebdff400A23E5Ad1CDeB11AfdD0087d5E9dFed8',
  [CHAIN.ETHEREUM]: '0x28E395a54a64284DBA39652921Cd99924f4e3797'
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
      target: address[chain],
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0NewTransferAdded],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash, topics: e.topics } as ITx});
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
    const supplySideRev = dailyFee * 0.25;
    const dailyHoldersRevenue = dailyFee * .60;
    const protocolRev = dailyFee * .15;

    return {
      dailyFees: dailyFee.toString(),
      dailySupplySideRevenue: supplySideRev.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
      dailyProtocolRevenue: protocolRev.toString(),
      dailyRevenue: (protocolRev + dailyHoldersRevenue).toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1679097600,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1679788800,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: 1698796800,
    },
  }
}


export default adapter;
