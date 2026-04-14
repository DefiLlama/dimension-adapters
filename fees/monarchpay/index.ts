import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const address = '0x0296fD8b25D2f7B0B434eD4423BFA0CC47D08276';

const fetch = async ({ getLogs }: FetchOptions) => {
  const logs = (await getLogs({
    target: address,
    topics: ['0xfee17e5caac7cbef9c34199cc11ac3c5a17abb3b07d5835053be283278606e43'],
  }))
  const dailyFees = logs.map((tx: any) => {
    return Number('0x' + tx.data) / 10 ** 6;
  }).reduce((a: number, b: number) => a + b, 0);
  return {
    dailyFees
  };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.KAVA]: {
      fetch: fetch,
      start: '2023-09-07',
    },
  },
  methodology: {
    Fees: 'Payment fees paid by users.',
  }
}

export default adapter;
