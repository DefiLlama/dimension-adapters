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

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: "0x382fFCe2287252F930E1C8DC9328dac5BF282bA1",
  });

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
