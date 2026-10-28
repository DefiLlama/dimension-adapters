// LP Agent — fees & revenue adapter.
//
// LP Agent (https://lpagent.io) is an automated liquidity-management agent. Users
// keep custody of their own wallets; the agent opens, rebalances, compounds and
// closes concentrated-liquidity positions on their behalf — Meteora (DLMM and
// DAMM v2) on Solana, and Uniswap V3 on Robinhood Chain.
//
// LP Agent charges a single fee: an 8% commission on the LP fees a managed
// position claims. It is taken at claim time and on the fee portion of a
// decrease or close, never on position principal, and it settles as a transfer
// into one fee wallet per chain:
//
//   Solana:          6ibaAcfpedjQucEpia9YtvkD6C3pEEf6zEdTutQzPb7M
//                    https://solscan.io/account/6ibaAcfpedjQucEpia9YtvkD6C3pEEf6zEdTutQzPb7M
//   Robinhood Chain: 0x56bf1CcC07988eB1fFB071C420c3a987252e501F
//                    https://robinhoodchain.blockscout.com/address/0x56bf1CcC07988eB1fFB071C420c3a987252e501F
//
// Both are plain externally-owned accounts that exist only to receive this
// commission — they hold no user funds, run no treasury operations, and have
// never sent a transfer out.
//
// Those wallet receipts are the 8% performance fee (dailyRevenue =
// dailyProtocolRevenue). Gross claimed LP fees are back-calculated as
// commission / 0.08; the remaining 92% stays in the user's wallet
// (dailySupplySideRevenue). Underlying DEX swap fees are already tracked by
// Meteora / Uniswap, so this adapter is marked doublecounted.
//
// On Robinhood Chain only the native gas token is counted. The commission there
// settles in native ETH, which the Allium trace fallback picks up whether it
// arrives as a top-level transfer or an internal call. The handful of ERC20
// transfers that wallet has received are operational top-ups and unsolicited
// airdrops rather than fees, and counting them would overstate revenue.
// -----------------------------------------------------------------------------------------------------
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getETHReceived, getSolanaReceived } from "../helpers/token";

const SOLANA_FEE_WALLET = "6ibaAcfpedjQucEpia9YtvkD6C3pEEf6zEdTutQzPb7M";
const ROBINHOOD_FEE_WALLET = "0x56bf1CcC07988eB1fFB071C420c3a987252e501F";

// 8% of claimed LP fees, per https://docs.lpagent.io/fee
const PERFORMANCE_FEE_RATE = 0.08;

const fetch = async (options: FetchOptions) => {
  const commission = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    await getSolanaReceived({ options, target: SOLANA_FEE_WALLET, balances: commission });
  } else {
    await getETHReceived({ options, target: ROBINHOOD_FEE_WALLET, balances: commission });
  }

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(commission, METRIC.PERFORMANCE_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(commission.clone((1 - PERFORMANCE_FEE_RATE) / PERFORMANCE_FEE_RATE), METRIC.LP_FEES);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailySupplySideRevenue);
  dailyFees.addBalances(dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total LP trading fees claimed by managed positions (Meteora DLMM and DAMM v2 on Solana, Uniswap V3 on Robinhood Chain). LP Agent's on-chain footprint is only the 8% commission, so gross claimed fees are back-calculated as commission / 0.08.",
  Revenue: "The 8% commission LP Agent takes on claimed LP fees — at claim time and on the fee portion of a decrease or close, never on position principal. Measured as transfers into the per-chain fee wallet. LP Agent retains all of it.",
  ProtocolRevenue: "The 8% commission retained by LP Agent. There is no token, no holder split, and no on-chain distribution of this inflow.",
  SupplySideRevenue: "The remaining 92% of claimed LP fees, which stay in the user's own wallet.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "92% of claimed LP trading fees kept by the position owner after LP Agent's commission.",
    [METRIC.PERFORMANCE_FEES]: "LP Agent's 8% commission on claimed LP fees, received by the per-chain fee wallet.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "The 8% commission retained by LP Agent. There is no token, no holder split, and no on-chain distribution of this inflow.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "The 8% commission retained by LP Agent. The fee wallets are receive-only EOAs; none of this inflow is distributed on chain.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "92% of claimed LP trading fees remaining in the user's wallet after the 8% commission.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  adapter: {
    [CHAIN.SOLANA]: { start: "2025-06-01" },
    [CHAIN.ROBINHOOD]: { start: "2026-08-18" },
  },
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  doublecounted: true, // underlying Meteora / Uniswap V3 swap fees
};

export default adapter;
