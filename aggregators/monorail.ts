import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: '0xA68A7F0601effDc65C64d9C47cA1b18D96B4352c',
    topic: '0x6e4c3aa29fc5ed6dc56aa0a95d8ac6660b6bf4e9c2ab49a0ea79b9cdafbcd7eb'
  })

  for (const log of logs) {
    const tokenIn = '0x' + log.topics[2].slice(26);
    const amountIn = BigInt('0x' + log.data.slice(2, 66));
    dailyVolume.add(tokenIn, amountIn);
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-10-27'
}

export default adapter;
