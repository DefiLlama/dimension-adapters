// fees/onchain-heritage/index.ts
// Onchain Heritage — Fees/Revenue (Optimism)
// Indexer-free approach: fees = count(Participated events) × fixed fee per participation (in ETH).
// NOTE: We intentionally set the fixed fee to 0n to avoid counting Optimism network gas as protocol fees.

import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// ===== Fixed fee per participation (in wei) =====
// Example conversions:
// 0.0005 ETH → 500000000000000n
// 0.001  ETH → 1000000000000000n
// Set to 0n since there is currently no on-chain protocol fee.
const FEE_PER_PARTICIPATION_WEI = 0n;

const PARTICIPATED_EVENT =
  "event Participated(address indexed user, uint256 userTotal, uint256 total)";

const CONTRACT = "0x988Ac408aBCa2032E2a2DF9E0296c5e3416Cc15b";

const fetch = async (options: FetchOptions) => {
  // Pull event logs within the given daily window
  const logs = await options.getLogs({
    target: CONTRACT,
    eventAbi: PARTICIPATED_EVENT,
  });

  const count = BigInt(logs.length);

  // Total fees = event count × fixed fee (wei)
  const totalFeesWei = count * FEE_PER_PARTICIPATION_WEI;

  // Balance helper for aggregation & pricing (Llama infra handles pricing)
  const balances = options.createBalances();

  // Add as native gas token on Optimism (not L2 gas! this is the modeled protocol fee)
  balances.addGasToken(totalFeesWei);

  // Assuming 100% of fees accrue to the protocol treasury
  return {
    dailyFees: balances,
    dailyRevenue: balances,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OPTIMISM],
  // Pick a sensible historical start for backfill
  start: "2025-07-21",
  methodology: {
    Fees:
      "Computed as count of `Participated` events per day multiplied by a fixed per-participation fee (in ETH). Set to 0 by default to avoid conflating Optimism network gas with protocol fees.",
    Revenue:
      "Assumes 100% of collected fees accrue to the protocol. Will update if there is a split to LPs/holders.",
  },
};

export default adapter;
