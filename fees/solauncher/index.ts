import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../../helpers/token";

// Solana platform fee wallet — receives all SOL fees
const SOLANA_FEE_WALLET = "G3JmWdEtHYxLrEEJwyMFdh1pPJC1aHFTybcrxBTC3bR1";

// Robinhood chain treasury — TokenFactory, Multisender, PinkLock02, and
// LiquidityHelper forward collected native ETH here after each user action.
const RH_TREASURY = "0x2665e484ff0BE967d8950CC148D499a108880E49";

// ─── Solana ──────────────────────────────────────────────────────────────────

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: [SOLANA_FEE_WALLET],
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

const methodology = {
  Fees: "Fees paid by users for token creation, liquidity management, multi-send, and LP locking.",
  Revenue: "All fees accrue to the Solauncher treasury — no supply-side distribution.",
  ProtocolRevenue: "100% of fees go to the Solauncher protocol treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
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
