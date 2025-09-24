import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BASE,
  CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.BSC,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
];

const blacklistTokens = [
  '0x888888ae2c4a298efd66d162ffc53b3f2a869888',
  '0x618679df9efcd19694bb1daa8d00718eacfa2883',
]

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: options.startOfDay > 1758067200 ? "0x8d413db42d6901de42b2c481cc0f6d0fd1c52828" : "0x382fFCe2287252F930E1C8DC9328dac5BF282bA1",
  });

  for (const token of blacklistTokens) {
    dailyFees.removeTokenBalance(token)
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: 'All fees paid by users for trading, swapping, bridging in Coinbase Wallet',
    Revenue: 'Fees collected by Coinbase paid by users for trading, swapping, bridging in Coinbase Wallet',
  },
  version: 2,
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetchFees,
      },
    };
  }, {}),
};

export default adapter;
