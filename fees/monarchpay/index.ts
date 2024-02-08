import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";

const address = '0x0296fD8b25D2f7B0B434eD4423BFA0CC47D08276';

interface ITx {
  data: string;
  transactionHash: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.KAVA, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.KAVA, {}));
  const logs: ITx[] = (await sdk.getEventLogs({
    target: address,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: ['0xfee17e5caac7cbef9c34199cc11ac3c5a17abb3b07d5835053be283278606e43'],
    chain: CHAIN.KAVA
  })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});
  const dailyFees = logs.map((tx: ITx) => {
    const amount = Number('0x' + tx.data) / 10 ** 6;
    return amount;
  }).reduce((a: number, b: number) => a+b,0);
  return {
    timestamp: timestamp,
    dailyFees: `${dailyFees}`
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.KAVA]: {
      fetch: fetch,
      start: 1694044800
    },
  }
}

export default adapter;
