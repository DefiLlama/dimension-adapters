import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../../helpers/token";

// Source: https://docs.solauncher.org/platform-fees/fees
// Confirmed in frontend/src/lib/constants.ts as PLATFORM_FEE_WALLET
const SOLANA_FEE_WALLET = "G3JmWdEtHYxLrEEJwyMFdh1pPJC1aHFTybcrxBTC3bR1";

// Source: frontend/src/config/chains/robinhoodChain.ts (Solauncher platform config)
// Robinhood chain mainnet treasury — TokenFactory, Multisender, PinkLock02,
// and LiquidityHelper forward collected native ETH here after each user action.
// Robinhood chain mainnet launched 2026-07-01; Solauncher EVM features went live 2026-08-01.
const RH_TREASURY = "0x2665e484ff0BE967d8950CC148D499a108880E49";

// ─── Solana ──────────────────────────────────────────────────────────────────

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: [SOLANA_FEE_WALLET],
    mints: [ADDRESSES.solana.SOL], // restrict to SOL-only; platform fees are SOL-denominated
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

// ─── Robinhood chain (EVM) ───────────────────────────────────────────────────

const fetchRobinhood = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    target: RH_TREASURY,
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All fees paid by users to use Solauncher tools.",
    Revenue: "All fees are collected by Solauncher protocol.",
    ProtocolRevenue: "All fees go to the Solauncher protocol treasury.",
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2024-06-01",
    },
    [CHAIN.ROBINHOOD]: {
      fetch: fetchRobinhood,
      start: "2026-08-01",
    },
  },
};

export default adapter;
