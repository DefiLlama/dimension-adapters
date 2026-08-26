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
// dailyFees = dailyRevenue = dailyProtocolRevenue = everything those wallets
// receive. LP Agent keeps all of it: there is no token, no holder distribution
// and no supply-side split paid out on chain.
//
// On Robinhood Chain only the native gas token is counted. The commission there
// settles in native ETH, which the Allium trace fallback picks up whether it
// arrives as a top-level transfer or an internal call. The handful of ERC20
// transfers that wallet has received are operational top-ups and unsolicited
// airdrops rather than fees, and counting them would overstate revenue.
// -----------------------------------------------------------------------------------------------------
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../helpers/token";

const SOLANA_FEE_WALLET = "6ibaAcfpedjQucEpia9YtvkD6C3pEEf6zEdTutQzPb7M";
const ROBINHOOD_FEE_WALLET = "0x56bf1CcC07988eB1fFB071C420c3a987252e501F";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    await getSolanaReceived({ options, target: SOLANA_FEE_WALLET, balances: dailyFees });
  } else {
    await getETHReceived({ options, target: ROBINHOOD_FEE_WALLET, balances: dailyFees });
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "The 8% commission LP Agent charges on the LP fees each managed position claims — taken at claim time and on the fee portion of a decrease or close, never on position principal. Measured as the value received by LP Agent's fee wallet on each chain.",
  Revenue: "All fees charged are kept by LP Agent.",
  ProtocolRevenue: "Same as Revenue — LP Agent has no token and distributes none of the fees on chain.",
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
  methodology,
};

export default adapter;
