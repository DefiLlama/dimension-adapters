import { FetchOptions, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

/**
 * Sharky Protocol Fee Wallet Address
 * Source: https://dune.com/queries/1939620
 * Official Sharkify Dune dashboard containing the protocol fee collection address
 */
const FEE_WALLET = "feegKBq3GAfqs9G6muPjdn8xEEZhALLTr2xsigDyxnV";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
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

const methodology = {
  Fees: "Tracks SOL received by the protocol fee wallet (feegKBq3GAfqs9G6muPjdn8xEEZhALLTr2xsigDyxnV)",
  Revenue: "All SOL received is considered revenue",
  ProtocolRevenue: "All the revenue goes to protocol",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-12-01',
  methodology,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;