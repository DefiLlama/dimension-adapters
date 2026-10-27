import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAppFees } from "./pumpdotfun";

// Pump.fun mobile app (interface listing). Tracks the App Fee (the docs' Platform Fee, 0.45%,
// 0.40% with a referral code) on trades placed through the official pump.fun mobile app, i.e.
// fee-wallet inflows in txs that run the app program. Website trades and conditional orders stay
// in the pumpdotfun adapter. The bonding-curve and PumpSwap trade fees on app trades are counted
// in the pumpdotfun / pump-swap listings, so they are not repeated here.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  for (const { mint, amount } of await queryAppFees(options, true))
    dailyFees.add(mint, amount, 'Pump Fun App Fees')
  return { dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-10-16', // first App Fee transfer
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  breakdownMethodology: {
    Fees: { 'Pump Fun App Fees': '0.45% app fee on pump.fun mobile app trades.' },
    Revenue: { 'Pump Fun App Fees': '0.45% app fee on pump.fun mobile app trades.' },
    ProtocolRevenue: { 'Pump Fun App Fees': '0.45% app fee on pump.fun mobile app trades.' },
  },
  methodology: {
    Fees: '0.45% app fee paid on pump.fun mobile app trades.',
    Revenue: '0.45% app fee paid on pump.fun mobile app trades, kept by pump.fun.',
    ProtocolRevenue: '0.45% app fee paid on pump.fun mobile app trades, kept by pump.fun.',
  },
}

export default adapter
