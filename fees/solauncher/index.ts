import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../../helpers/token";

// Source: https://docs.solauncher.org/platform-fees/fees
const SOLANA_FEE_WALLET = "G3JmWdEtHYxLrEEJwyMFdh1pPJC1aHFTybcrxBTC3bR1";

// Robinhood chain mainnet treasury — TokenFactory, Multisender, PinkLock02,
// and LiquidityHelper forward collected native ETH here after each user action.
// Source: frontend/src/config/chains/robinhoodChain.ts (Solauncher platform config)
const RH_TREASURY = "0x2665e484ff0BE967d8950CC148D499a108880E49";

const solanaFetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: SOLANA_FEE_WALLET,
    mints: [ADDRESSES.solana.SOL],
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const robinhoodFetch: any = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    target: RH_TREASURY,
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All fees paid by users to use a particular Solauncher tool.",
  Revenue: "All fees are collected by Solauncher protocol.",
  ProtocolRevenue: "All fees are collected by Solauncher protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: solanaFetch,
      start: "2024-06-01",
    },
    [CHAIN.ROBINHOOD]: {
      fetch: robinhoodFetch,
      start: "2026-08-01",
    },
  },
};

export default adapter;
