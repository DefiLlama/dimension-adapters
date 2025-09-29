import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const contract: any = {
  [CHAIN.BASE]: [
    '0x5cb7c9605888f5de8c1132acd9930af0cdb29a5e',
    '0x8bE2c661b35161A138A35C84F77895c4cc23900D',
  ]
}
const varder = '0x731814e491571A2e9eE3c5b1F7f3b962eE8f4870';

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await addTokensReceived({
    options,
    targets: contract[options.chain],
    token: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
    balances: dailyFees,
  })

  // fees when swap varder-ai
  await addTokensReceived({
    options,
    target: varder,
    token: varder,
    balances: dailyFees,
  })
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-09-09',
    },
  },
  methodology: {
    Fees: "All fees paid by users.",
    Revenue: "All fees paid by users.",
    ProtocolRevenue: "All fees paid by users.",
  }
}

export default adapter;
