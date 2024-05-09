import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";

const address = '0xbfb083840b0507670b92456264164e5fecd0430b';
const topic0 = '0x4c7b764f428c13bbea8cc8da90ebe6eef4dafeb27a4e3d9041d64208c47ca7c2';

interface ITx {
  data: string;
  transactionHash: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

  const fromBlock = (await getBlock(todaysTimestamp, CHAIN.AVAX, {}));
  const toBlock = (await getBlock(yesterdaysTimestamp, CHAIN.AVAX, {}));
  const logs: ITx[] = (await sdk.getEventLogs({
    target: address,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0],
    chain: CHAIN.AVAX
  })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});
  const dailyFees = logs.map((tx: ITx) => {
    const amount = Number('0x' + tx.data.slice(192, 256)) / 10 **  18;
    return amount;
  }).reduce((a: number, b: number) => a+b,0);
  return {
    timestamp: timestamp,
    dailyFees: `${dailyFees}`,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: 1653134400
    },
  }
}

export default adapter;
