import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const HL_BUILDER_ADDRESS = "0xa47d4d99191db54a4829cdf3de2417e527c3b042";
const LIGHTER_API_BASE_URL = "https://mainnet.zklighter.elliot.ai/api/v1/partnerStats";
const LIGHTER_ACCOUNT_INDEX = 728059;

const TRADING_FEES_TO_TREASURY = "Trading Fees To Treasury";
const TRADING_FEES_TO_STAKERS = "Trading Fees To Stakers";

// Same split as the former pear-protocol Hyperliquid/Lighter adapter.
// Before 2026-01-27: 20% treasury, 80% shared with PEAR stakers directly.
// From 2026-01-27 onward: 30% treasury, 70% used for token buybacks instead.
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

const splitRevenue = (options: FetchOptions, dailyFees: ReturnType<FetchOptions["createBalances"]>) => {
  const { protocolShare, holdersShare } = getRevenueSplit(options);
  const holdersLabel = getHoldersRevenueLabel(options);

  const dailyRevenue = options.createBalances();
  dailyRevenue.add(dailyFees.clone(protocolShare), TRADING_FEES_TO_TREASURY);
  dailyRevenue.add(dailyFees.clone(holdersShare), holdersLabel);

  return {
    dailyRevenue,
    dailyProtocolRevenue: dailyFees.clone(protocolShare, TRADING_FEES_TO_TREASURY),
    dailyHoldersRevenue: dailyFees.clone(holdersShare, holdersLabel),
  };
};

const fetchHyperliquid = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees } = await fetchBuilderCodeRevenue({
    options,
    builder_address: HL_BUILDER_ADDRESS,
  });

  const fees = options.createBalances();
  fees.addBalances(dailyFees, "Hyperliquid Builder Code Fees");

  return { dailyVolume, dailyFees: fees, ...splitRevenue(options, fees) };
};

const fetchLighter = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const response = await fetchURL(
    `${LIGHTER_API_BASE_URL}?account_index=${LIGHTER_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`
  );

  dailyVolume.addUSDValue(Number(response.total_volume));
  dailyFees.addUSDValue(Number(response.total_fees_earned), "Lighter Partner Fees");

  return { dailyVolume, dailyFees, ...splitRevenue(options, dailyFees) };
};

const methodology = {
  Volume: "Notional volume of perpetual trades routed through Pear Interface on Hyperliquid (builder code) and Lighter (partner account 728059).",
  Fees: "Builder code fees from Hyperliquid perps trades and partner fees from Pear Interface's Lighter perps integration.",
  Revenue: "All fees are retained by Pear, split between the protocol treasury and token holders, so revenue equals fees.",
  ProtocolRevenue: "Share of fees paid directly to the Pear Protocol treasury: 20% before 2026-01-27, 30% from that date onward.",
  HoldersRevenue: "Share of fees going to PEAR token holders: 80% before 2026-01-27 (shared directly with stakers), 70% from that date onward (used for token buybacks instead).",
};

const breakdownMethodology = {
  Fees: {
    "Hyperliquid Builder Code Fees": "Builder code fees from Hyperliquid perps trades routed through Pear Interface.",
    "Lighter Partner Fees": "Partner fees earned by Pear Interface through its Lighter perps integration.",
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
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-07-08",
    },
    [CHAIN.ZK_LIGHTER]: {
      fetch: fetchLighter,
      start: "2026-06-10",
    },
  },
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
