import { Adapter, ChainBlocks, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const address = '0xbfb083840b0507670b92456264164e5fecd0430b';
const topic = '0x4c7b764f428c13bbea8cc8da90ebe6eef4dafeb27a4e3d9041d64208c47ca7c2';

const fetch: any = async (timestamp: number, _: ChainBlocks, { getLogs, }: FetchOptions) => {
  const logs: any[] = await getLogs({ target: address, topic, })
  const dailyVolume = logs.map((tx: any) => {
    const amount = Number('0x' + tx.data.slice(64, 128)) / 10 ** 18;
    return amount;
  }).reduce((a: number, b: number) => a + b, 0);
  return { timestamp, dailyVolume, };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-05-21'
    },
  }
}

export default adapter;
