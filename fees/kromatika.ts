import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// Kromatika contract addresses on different chains
const CONTRACTS: { [key: string]: string } = {
  [CHAIN.OPTIMISM]: "0x7314af7d05e054e96c44d7923e68d66475ffaab8",
  [CHAIN.ETHEREUM]: "0xd1fdf0144be118c30a53e1d08cc1e61d600e508e",
  [CHAIN.ARBITRUM]: "0x02c282f60fb2f3299458c2b85eb7e303b25fc6f0",
  [CHAIN.POLYGON]: "0x03f490ae5b59e428e6692059d0dca1b87ed42ae1",
};

const fetch = async (options: FetchOptions) => {
  const contract = CONTRACTS[options.chain];
  const dailyFees = options.createBalances();
  
  await addTokensReceived({
    options,
    target: contract,
    balances: dailyFees,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2022-08-01",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2022-01-01",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2022-08-01",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2022-08-01",
    },
  },
  methodology: {
    Fees: "All tokens received by Kromatika limit order contracts represent fees collected from users for executing limit orders on Uniswap V3",
    Revenue: "All fees go to the protocol",
    ProtocolRevenue: "100% of collected fees"
  }
};

export default adapter;