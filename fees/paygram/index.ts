// Paygram (https://usepaygram.com) launches pump.fun / Raydium LaunchLab coins with the Paygram router as creator and
// splits the creator fees off-chain: 80% to the chosen @handle (or the coin's holders), 20% buys and burns $PAYGRAM
// (protocolShareBps 2000 in https://usepaygram.com/api/v1/fee-terms).
// Data: https://usepaygram.com/api/public/v1/stats/day?date=YYYY-MM-DD (fee_claims ledger). Fees are booked on the day
// Paygram collects them from the creator vaults, not on the day of the trade.
//
// On-chain trail, to rebuild the adapter if the API goes away:
//   Router (pump.fun creator of every launch)  EaDHLNyJXukNVBvbPEKjoe7uvGVgfrNVcbztwopSquY8
//   Router bonding-curve creator vault (SOL)    tp4sWqHvN7VjBc1GG3KHDhTvMfbUBmY52ujaJepKB6W
//   Router PumpSwap creator vault (WSOL)        9cowtWAZ65YtbaisZh9u961jdHb6FLhx9GD7wrQ1jjnq (authority LG2xzVQdL4WHQfyUyKWqBFaKevgRSg2WHbfLZKgcs9P)
//   On 2026-10-22 every coin moved to a pump.fun fee-sharing config (admin = router, 100% to the Paygram vault
//   3yKNXt3Ustha74URAbyaN8csdkk731L8UWxbGzDmtt1m), paid out by distribute_creator_fees; nothing distributed through 2026-10-27.
//   $PAYGRAM mint                              DzTyqMUbsWSvJeEzucEpyrjhcpV4FXYxDerX9UqRnvuj
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const API = "https://usepaygram.com/api/public/v1/stats/day";

const LABELS = {
  CREATOR_FEES: METRIC.CREATOR_FEES,
  TO_RECIPIENTS: "Creator Fees To Recipients",
  BUY_BACK: METRIC.TOKEN_BUY_BACK,
};

const fetch = async (options: FetchOptions) => {
  const day = await httpGet(`${API}?date=${options.dateString}`);
  if (day?.day !== options.dateString || ["feesCollectedLamports", "creatorShareLamports", "protocolShareLamports"].some((k) => typeof day[k] !== "number"))
    throw new Error(`paygram: bad stats response for ${options.dateString}: ${JSON.stringify(day)}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // creator fees collected that day, split in the same period: fees = creator share (80%) + protocol share (20%)
  dailyFees.addCGToken("solana", day.feesCollectedLamports / 1e9, LABELS.CREATOR_FEES);
  dailySupplySideRevenue.addCGToken("solana", day.creatorShareLamports / 1e9, LABELS.TO_RECIPIENTS);
  // the whole protocol share is set aside for the $PAYGRAM buyback and burn; buybackExecutedLamports is not used, it
  // only covers 2026-10-20 while the ledger shows ~10.8 SOL of buybacks
  dailyRevenue.addCGToken("solana", day.protocolShareLamports / 1e9, LABELS.BUY_BACK);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailySupplySideRevenue,
    // nothing goes to a treasury: the whole protocol share is used for the $PAYGRAM buyback and burn
    dailyProtocolRevenue: options.createBalances(),
    dailyHoldersRevenue: dailyRevenue.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-18",
  doublecounted: true,
  methodology: {
    Fees: "Pump.fun and Raydium LaunchLab creator fees paid by traders of coins launched through Paygram, counted when Paygram collects them.",
    UserFees: "Pump.fun and Raydium LaunchLab creator fees paid by traders of coins launched through Paygram.",
    Revenue: "The 20% protocol share of the collected creator fees, used to buy back and burn $PAYGRAM.",
    SupplySideRevenue: "The 80% share of the collected creator fees owed to the @handle or the coin holders each coin was launched for.",
    ProtocolRevenue: "Paygram keeps none of the creator fees in a treasury: its whole 20% share is used to buy back and burn $PAYGRAM.",
    HoldersRevenue: "The 20% protocol share of the collected creator fees, used to buy back and burn $PAYGRAM.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.CREATOR_FEES]: "Pump.fun and Raydium LaunchLab creator fees on coins launched through Paygram, collected by the Paygram router.",
    },
    UserFees: {
      [LABELS.CREATOR_FEES]: "Pump.fun and Raydium LaunchLab creator fees paid by traders of coins launched through Paygram.",
    },
    Revenue: {
      [LABELS.BUY_BACK]: "20% of the collected creator fees, used to buy back and burn $PAYGRAM.",
    },
    SupplySideRevenue: {
      [LABELS.TO_RECIPIENTS]: "80% of the collected creator fees, owed to the @handle (X, Telegram, GitHub or Fomo) or the coin holders each coin was launched for.",
    },
    HoldersRevenue: {
      [LABELS.BUY_BACK]: "20% of the collected creator fees, used to buy back and burn $PAYGRAM.",
    },
  },
};

export default adapter;
