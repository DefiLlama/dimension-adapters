import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// Fee recipient addresses for different chains
const FEE_RECIPIENTS = {
  [CHAIN.ETHEREUM]: "0x521faAcDFA097ad35a32387727e468F7fD032fD6",
  [CHAIN.BSC]: "0x521faAcDFA097ad35a32387727e468F7fD032fD6",
  [CHAIN.BASE]: "0x521faAcDFA097ad35a32387727e468F7fD032fD6",
  [CHAIN.ARBITRUM]: "0x521faAcDFA097ad35a32387727e468F7fD032fD6",
  [CHAIN.GRAVITY]: "0x521faAcDFA097ad35a32387727e468F7fD032fD6",
  [CHAIN.MORPH]: "0x521faAcDFA097ad35a32387727e468F7fD032fD6"
};

const methodology = {
  Fees: "All tokens received by the protocol's fee recipient addresses",
  Revenue: "All collected fees are considered as protocol revenue",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const feeRecipient = FEE_RECIPIENTS[options.chain as keyof typeof FEE_RECIPIENTS];

  await addTokensReceived({ 
    balances: dailyFees, 
    target: feeRecipient, 
    options,
  });

  return { 
    dailyFees, 
    dailyRevenue: dailyFees, 
    dailyProtocolRevenue: dailyFees 
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { 
      fetch, 
      start: '2024-09-20',
      meta: { methodology } 
    },
    [CHAIN.BSC]: { 
      fetch, 
      start: '2024-09-19',
      meta: { methodology } 
    },
    [CHAIN.BASE]: { 
      fetch, 
      start: '2024-09-20',
      meta: { methodology } 
    },
    [CHAIN.ARBITRUM]: { 
      fetch, 
      start: '2024-11-28',
      meta: { methodology } 
    },
    [CHAIN.GRAVITY]: { 
      fetch, 
      start: '2024-12-11',
      meta: { methodology } 
    },
    [CHAIN.MORPH]: { 
      fetch, 
      start: '2024-12-11',
      meta: { methodology } 
    },
  }
};

export default adapter;