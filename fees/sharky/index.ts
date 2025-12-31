import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

/**
 * Shartky Protocol Fee Wallet Address
 * Source: https://dune.com/queries/1939620
 * Official Sharkify Dune dashboard containing the protocol fee collection address
 */
const FEE_WALLET = "feegKBq3GAfqs9G6muPjdn8xEEZhALLTr2xsigDyxnV";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: FEE_WALLET,
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
    [CHAIN.SOLANA]: {
      fetch,
      start: 1704067200, // January 1, 2024
    },
  },
  methodology: {
    Fees: "Tracks SOL received by the protocol fee wallet (feegKBq3GAfqs9G6muPjdn8xEEZhALLTr2xsigDyxnV). Fee wallet source: https://dune.com/queries/1939620",
    Revenue: "All SOL received is considered protocol revenue",
  },
};

export default adapter;