import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const TRADING_FEES_TO_TREASURY = "Trading Fees To Treasury";
const TRADING_FEES_TO_STAKERS = "Trading Fees To Stakers";

// Pear migrated its trading engine around 2026-05-27. Hyperliquid and Lighter
// volume/fees after that date are tracked by dexs/pear-interface (builder codes).
const MIGRATION_DATE = "2026-05-27";

// How fees are split between the treasury and token holders has changed once.
// Before 2026-01-27: 20% treasury, 80% shared with PEAR stakers directly.
// From 2026-01-27 onward: 30% treasury, 70% used for token buybacks instead.
// Either way, nothing goes to LPs, so total revenue always equals total fees.
const REVENUE_SPLIT_CHANGE_DATE = "2026-01-27T00:00:00.000Z";

const getRevenueSplit = (options: FetchOptions) => {
  const changeMs = new Date(REVENUE_SPLIT_CHANGE_DATE).getTime();
  const requestMs = options.startTimestamp * 1000;
  if (requestMs < changeMs) {
    return { protocolShare: 0.2, holdersShare: 0.8 };
  }
  return { protocolShare: 0.3, holdersShare: 0.7 };
};

const getHoldersRevenueLabel = (options: FetchOptions) => {
  const changeMs = new Date(REVENUE_SPLIT_CHANGE_DATE).getTime();
  const requestMs = options.startTimestamp * 1000;
  if (requestMs < changeMs) {
    return TRADING_FEES_TO_STAKERS;
  }
  return METRIC.TOKEN_BUY_BACK;
};

const fetch = async (options: FetchOptions) => {
  const url = `https://api.pearprotocol.io/v1/metric?timestamp=${options.endTimestamp}`;
  const response = await fetchURL(url);
  const volumeUsd = response.payload.dailyVolume;
  const feesUsd = response.payload.dailyFees;

  const { protocolShare, holdersShare } = getRevenueSplit(options);
  const holdersLabel = getHoldersRevenueLabel(options);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyVolume.addUSDValue(volumeUsd);
  dailyFees.addUSDValue(feesUsd, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(feesUsd * protocolShare, TRADING_FEES_TO_TREASURY);
  dailyRevenue.addUSDValue(feesUsd * holdersShare, holdersLabel);
  dailyProtocolRevenue.addUSDValue(feesUsd * protocolShare, TRADING_FEES_TO_TREASURY);
  dailyHoldersRevenue.addUSDValue(feesUsd * holdersShare, holdersLabel);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "Trading fees from Pear Protocol perpetual trades via the legacy Arbitrum engine.",
  },
  Revenue: {
    [TRADING_FEES_TO_TREASURY]:
      "Share of trading fees allocated to the Pear Protocol treasury.",
    [TRADING_FEES_TO_STAKERS]:
      "Share of trading fees shared directly with PEAR token stakers (before 2026-01-27).",
    [METRIC.TOKEN_BUY_BACK]:
      "Share of trading fees used for PEAR token buybacks (from 2026-01-27 onward).",
  },
  ProtocolRevenue: {
    [TRADING_FEES_TO_TREASURY]:
      "Share of trading fees allocated to the Pear Protocol treasury: 20% before 2026-01-27, 30% from that date onward.",
  },
  HoldersRevenue: {
    [TRADING_FEES_TO_STAKERS]:
      "Share of trading fees shared directly with PEAR token stakers: 80% before 2026-01-27.",
    [METRIC.TOKEN_BUY_BACK]:
      "Share of trading fees used for PEAR token buybacks: 70% from 2026-01-27 onward.",
  },
};

const adapter: SimpleAdapter = {
  // Legacy metrics API only supports a single endTimestamp per call (one
  // aggregate per day), so this adapter is called on the fixed one-day-at-a-time
  // schedule that version 1 guarantees.
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2024-05-08",
      deadFrom: MIGRATION_DATE,
    },
  },
  methodology: {
    Volume: "Notional trading volume from Pear's legacy Arbitrum engine, pulled from Pear's metrics API. After 2026-05-27, Hyperliquid and Lighter volume is tracked by pear-interface.",
    Fees: "Trading fees paid by users on Pear's legacy Arbitrum engine. After 2026-05-27, Hyperliquid and Lighter fees are tracked by pear-interface.",
    Revenue: "All fees are retained by Pear, split between the protocol treasury and token holders, so revenue equals fees.",
    ProtocolRevenue: "Share of fees paid directly to the Pear Protocol treasury: 20% before 2026-01-27, 30% from that date onward.",
    HoldersRevenue: "Share of fees going to PEAR token holders: 80% before 2026-01-27 (shared directly with stakers), 70% from that date onward (used for token buybacks instead).",
  },
  breakdownMethodology,
};

export default adapter;
