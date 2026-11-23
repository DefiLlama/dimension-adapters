import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Onagi (https://onagi.si) perps are Lighter perps on Robinhood Chain (the venue tracked by dexs/lighter-rh),
// routed through Onagi's Lighter integrator account. Lighter's public partner stats return the volume of the
// trades Onagi routed in any time window and the integrator fee Onagi earned on them.
const PARTNER_STATS = "https://api.rh.lighter.xyz/api/v1/partnerStats";
// Onagi's Lighter integrator account (fee recipient approved by every Onagi trader, see https://onagi.si/docs)
const ONAGI_ACCOUNT_INDEX = 22388;

// Onagi pools these fees with its other income (fees/onagi.ts, onagi-predict in factory/polymarket.ts) and splits
// all of it the same way: 50% paid to ONAGI holders in USDG, 25% buys ONAGI and burns it, 25% treasury
// (split.payoutBps / buybackBps / treasuryBps in https://onagi.si/data/cycles.json).
const HOLDERS_PAYOUT_SHARE = 0.5;
const BUYBACK_BURN_SHARE = 0.25;
const TREASURY_SHARE = 0.25;

const LABELS = {
  PERPS_TRADING_FEES: "Perps Trading Fees",
  HOLDER_PAYOUTS: "Holder Payouts",
  BUYBACK_BURN: "Token Buyback And Burn",
  TREASURY: "Treasury",
} as const;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const stats = await fetchURL(
    `${PARTNER_STATS}?account_index=${ONAGI_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`
  );
  dailyVolume.addUSDValue(Number(stats.total_volume));
  dailyFees.addUSDValue(Number(stats.total_fees_earned), LABELS.PERPS_TRADING_FEES);

  dailyHoldersRevenue.addBalances(dailyFees.clone(HOLDERS_PAYOUT_SHARE), LABELS.HOLDER_PAYOUTS);
  dailyHoldersRevenue.addBalances(dailyFees.clone(BUYBACK_BURN_SHARE), LABELS.BUYBACK_BURN);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyHoldersRevenue,
    dailyProtocolRevenue: dailyFees.clone(TREASURY_SHARE, LABELS.TREASURY),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-10-22",
  doublecounted: true,
  methodology: {
    Volume: "Notional volume of Lighter perps trades (Robinhood Chain) routed through Onagi's integrator account, from Lighter's partner stats.",
    Fees: "Onagi's integrator fee on Lighter perps trades routed through Onagi, from Lighter's partner stats.",
    UserFees: "Onagi's integrator fee, paid by traders on top of Lighter's own fees on perps trades routed through Onagi.",
    Revenue: "All of Onagi's integrator fee on Lighter perps trades, kept by Onagi.",
    HoldersRevenue: "75% of Onagi's perps integrator fee: 50% is paid to eligible ONAGI holders in USDG and 25% buys ONAGI and sends it to the burn address. Computed from Onagi's published split.",
    ProtocolRevenue: "25% of Onagi's perps integrator fee goes to the Onagi treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.PERPS_TRADING_FEES]: "Onagi's integrator fee on Lighter perps trades routed through Onagi (total_fees_earned in Lighter's partner stats).",
    },
    UserFees: {
      [LABELS.PERPS_TRADING_FEES]: "Onagi's integrator fee paid by traders on Lighter perps trades routed through Onagi.",
    },
    Revenue: {
      [LABELS.PERPS_TRADING_FEES]: "All perps integrator fees, kept by Onagi.",
    },
    HoldersRevenue: {
      [LABELS.HOLDER_PAYOUTS]: "50% of perps integrator fees, paid to eligible ONAGI holders in USDG.",
      [LABELS.BUYBACK_BURN]: "25% of perps integrator fees, used to buy ONAGI and burn it.",
    },
    ProtocolRevenue: {
      [LABELS.TREASURY]: "25% of perps integrator fees, kept by the Onagi treasury.",
    },
  },
};

export default adapter;
