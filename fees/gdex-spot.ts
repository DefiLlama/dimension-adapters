import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * GDEX Spot: token swaps placed through GDEX (gdex.pro, by Gemach DAO) on Solana.
 *
 * Every swap carries a platform fee of 1% of its SOL leg, paid in the swap transaction itself as a native
 * SOL transfer from the user's wallet to the GDEX Solana treasury. SOL withdrawals out of a GDEX wallet pay
 * 0.1% (1% when bridging) to the same treasury the same way. Fees are measured as native SOL received by it;
 * every sender seen in a decode of recent history (2026-05-29 to 2026-10-01) is a user wallet.
 *
 * Only dailyFees is reported. The same treasury also pays out GDEX's referral rewards (a supply-side cost),
 * claimed by referrers at their own pace, so retained revenue cannot be separated on-chain from the inflow.
 * skipBreakdownValidation is set for this reason, rather than aliasing gross fees to revenue.
 *
 * EVM chains are not tracked: their treasuries receive only a handful of fee transfers per month.
 * Hyperliquid perps are listed separately as gdex-perps (builder code).
 */

// GDEX Solana treasury, the fee receiver for every GDEX swap on Solana. Sample swap paying the 1% fee:
// https://solscan.io/tx/5gvK61n74yxRFzAcDuac7hqmap6RfFF1nVVpDmairmikXwp4QcDXpTX8wS3yogZRq4sE1m8TVpeFTKmbLwacMWgr
const SOL_TREASURY = "HLY8UNd7jmvtJuAz3q2MgJ7qF3QedDvoeUbnK5FZsUxS";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const fees = await getSolanaReceived({ options, target: SOL_TREASURY, mints: [ADDRESSES.solana.SOL] });
  dailyFees.addBalances(fees, METRIC.TRADING_FEES);
  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  // First transaction into the treasury.
  start: "2024-05-27",
  dependencies: [Dependencies.ALLIUM],
  // Referral payouts leave the same treasury and cannot be separated from the fee inflow on-chain,
  // so no revenue / supply-side split is derived. Only gross dailyFees is reported.
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Platform fees paid by GDEX users on Solana, received in SOL by the GDEX treasury: 1% of the SOL side of each swap, and 0.1% on SOL withdrawals (1% when bridging).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "1% platform fee on GDEX swaps and 0.1% fee on SOL withdrawals (1% when bridging), received in SOL by the GDEX Solana treasury.",
    },
  },
};

export default adapter;
