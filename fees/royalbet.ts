// DefiLlama Fees Adapter for RoyalBet
// File path in dimension-adapters repo: fees/royalbet.ts
//
// This adapter tracks platform fees collected by the RoyalBet Telegram bot
// on Solana. The bot charges a 3% platform fee on each betting match pot,
// which is sent to the treasury wallet.

import { SimpleAdapter, FetchOptions, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const TREASURY_ADDRESS = "MoEcUAUh3zC8gGMh2wiRJx3ShbAoHqpxLKeGfJ1KFcm";

const fetch = async (_timestamp: number, _: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: TREASURY_ADDRESS,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-02-20",
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Platform fees (3%) collected from betting match pots on the RoyalBet Telegram bot.",
    Revenue: "All fees are protocol revenue.",
    ProtocolRevenue: "All fees are collected by the protocol treasury.",
  },
};

export default adapter;
