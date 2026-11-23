// Rushr — fees & revenue adapter.
//
// Rushr (https://rushr.trade) is an open-source social trading app on Robinhood Chain (chainId 4663) where
// people and AI agents trade, post calls and share one leaderboard. Its trading terminal charges a platform
// fee on every trade made through it (0.25% during the beta, 0.5% after; 10% off for referred traders),
// shown on each quote and paid in ETH or USDG:
//   - Uniswap routes: taken inside the swap transaction by Uniswap's Universal Router (PAY_PORTION);
//   - PONS bonding-curve trades: a plain ETH transfer right after the trade.
// Source: https://github.com/rushr-dev/platform (packages/trade/src/config.ts) and https://rushr.trade/whitepaper
//
// All platform fees go to the Rushr treasury, a Safe multisig:
//   https://robinhoodchain.blockscout.com/address/0x2Ae062C61A757b66D3039154a6e965aa48Cd75F3
// The Safe emits SafeReceived for every ETH payment it receives (internal transfers from the router
// included), so ETH fees are read from those logs; USDG fees are ERC-20 transfers into the Safe.
// The treasury receives nothing but platform fees. Every fee, buyback and burn is listed on
// https://rushr.trade/transparency.
//
// dailyFees = dailyRevenue = dailyProtocolRevenue: the whole platform fee is kept by the protocol (there is
// no LP or creator share).
//   - Referrals: a referred trader pays a 10% lower rate on-chain, and the full (discounted) fee still goes
//     to the Safe. A referrer share is only recorded off-chain for a possible later payout; no referral
//     payouts have been made, so none is reported as supply-side revenue. If payouts start, they will leave
//     the Safe as on-chain transfers and this adapter will report them as dailySupplySideRevenue.
//   - Buybacks: no RUSHR buyback has been paid from platform fees yet. When the weekly buyback-and-burn
//     starts, the burned share will be reported as dailyHoldersRevenue.
//   - The RUSHR token's own creator tax (PONS launchpad) is paid to the token's creator wallet, not to the
//     Safe, and is not a platform fee, so it is out of scope here.
//
// Before 2026-11-16 01:20 UTC fees were paid to a plain wallet (0x447a590b70cd55Cc6B62CEaf79D4c6c09A955E40),
// mostly through internal transfers that leave no logs; that first day (~0.0007 ETH) is not covered.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

const RUSHR_TREASURY = "0x2Ae062C61A757b66D3039154a6e965aa48Cd75F3";

// Safe v1.5.0 event emitted when the Safe receives native ETH (receive/fallback).
const SAFE_RECEIVED = "event SafeReceived(address indexed sender, uint256 value)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const received = await options.getLogs({ target: RUSHR_TREASURY, eventAbi: SAFE_RECEIVED });
  for (const log of received) dailyFees.addGasToken(log.value, METRIC.TRADING_FEES);

  const usdg = await addTokensReceived({ options, target: RUSHR_TREASURY, token: ADDRESSES.robinhood.USDG });
  dailyFees.addBalances(usdg, METRIC.TRADING_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "Rushr's platform fee on trades made through the Rushr app or agent API (0.25% during the beta), counted as the ETH and USDG received by the Rushr treasury Safe.",
  Revenue: "All platform fees are kept by the protocol treasury.",
  ProtocolRevenue: "All platform fees are kept by the protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Platform fee paid on each trade made through Rushr, received by the treasury Safe in ETH (SafeReceived logs) or USDG (token transfers).",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "The full platform fee, kept by the protocol treasury.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "The full platform fee, kept by the protocol treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-11-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
