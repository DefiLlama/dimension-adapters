import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const FEES_API = "https://app.liquidium.wtf/api/defi-llama/fees";
const SATS_PER_BTC = 1e8;

// 30% of protocol revenue buys LIQ on the open market for sLIQ stakers.
// Staking launched in September 2025; before that all revenue stayed with the protocol.
const BUYBACK_SHARE = 0.3;
const BUYBACK_START = Date.UTC(2025, 8, 17) / 1000;

const ACTIVATION_FEES = "Loan Activation Fees";
const INTEREST_TO_PROTOCOL = "Borrow Interest To Protocol";
const INTEREST_TO_LENDERS = "Borrow Interest To Lenders";
const PROTOCOL_SHARE = "Revenue Kept By Protocol";

type FeeHistoryResponse = {
  success: boolean;
  asset: string;
  decimals: number;
  activationFees: unknown;
  protocolInterestFees: unknown;
  lenderInterest: unknown;
};

function satsToBtc(rawAmount: unknown): number {
  if (typeof rawAmount !== "string" || !/^\d+$/.test(rawAmount)) {
    throw new Error("Liquidium WTF fees API returned an invalid amount");
  }
  return Number(rawAmount) / SATS_PER_BTC;
}

async function fetch(options: FetchOptions) {
  const query = new URLSearchParams({
    from: new Date(options.startTimestamp * 1000).toISOString(),
    to: new Date(options.endTimestamp * 1000).toISOString(),
  });
  const response = (await httpGet(`${FEES_API}?${query}`)) as FeeHistoryResponse;

  if (response.success !== true || response.asset !== "BTC" || response.decimals !== 8) {
    throw new Error("Liquidium WTF fees API returned an invalid response");
  }

  const activationFees = satsToBtc(response.activationFees);
  const protocolInterestFees = satsToBtc(response.protocolInterestFees);
  const lenderInterest = satsToBtc(response.lenderInterest);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addCGToken("bitcoin", activationFees, ACTIVATION_FEES);
  dailyFees.addCGToken("bitcoin", protocolInterestFees, INTEREST_TO_PROTOCOL);
  dailyFees.addCGToken("bitcoin", lenderInterest, INTEREST_TO_LENDERS);

  dailyRevenue.addCGToken("bitcoin", activationFees, ACTIVATION_FEES);
  dailyRevenue.addCGToken("bitcoin", protocolInterestFees, INTEREST_TO_PROTOCOL);

  dailySupplySideRevenue.addCGToken("bitcoin", lenderInterest, INTEREST_TO_LENDERS);

  const holdersShare = options.startTimestamp >= BUYBACK_START ? BUYBACK_SHARE : 0;
  const revenue = activationFees + protocolInterestFees;
  dailyHoldersRevenue.addCGToken("bitcoin", revenue * holdersShare, METRIC.TOKEN_BUY_BACK);
  dailyProtocolRevenue.addCGToken("bitcoin", revenue * (1 - holdersShare), PROTOCOL_SHARE);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Activation fees charged when a loan starts, plus interest paid by borrowers on repaid loans, after LIQ holder discounts.",
  UserFees: "Activation fees charged when a loan starts, plus interest paid by borrowers on repaid loans, after LIQ holder discounts.",
  Revenue: "Activation fees plus the Liquidium share of interest on repaid loans.",
  ProtocolRevenue: "Revenue kept by Liquidium after LIQ buybacks.",
  HoldersRevenue: "30% of revenue buys LIQ on the open market and is distributed to sLIQ stakers, since staking launched in September 2025.",
  SupplySideRevenue: "Interest paid to lenders on repaid loans.",
};

const breakdownMethodology = {
  Fees: {
    [ACTIVATION_FEES]: "One-time fee charged to the borrower when a loan starts on-chain.",
    [INTEREST_TO_PROTOCOL]: "Liquidium's share of the interest on repaid loans, after LIQ holder discounts.",
    [INTEREST_TO_LENDERS]: "Interest paid to lenders on repaid loans.",
  },
  UserFees: {
    [ACTIVATION_FEES]: "One-time fee charged to the borrower when a loan starts on-chain.",
    [INTEREST_TO_PROTOCOL]: "Liquidium's share of the interest on repaid loans, after LIQ holder discounts.",
    [INTEREST_TO_LENDERS]: "Interest paid to lenders on repaid loans.",
  },
  Revenue: {
    [ACTIVATION_FEES]: "One-time fee charged to the borrower when a loan starts on-chain.",
    [INTEREST_TO_PROTOCOL]: "Liquidium's share of the interest on repaid loans, after LIQ holder discounts.",
  },
  ProtocolRevenue: {
    [PROTOCOL_SHARE]: "Revenue kept by Liquidium after LIQ buybacks.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "30% of revenue used for daily LIQ buybacks distributed to sLIQ stakers.",
  },
  SupplySideRevenue: {
    [INTEREST_TO_LENDERS]: "Interest paid to lenders on repaid loans.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BITCOIN],
  start: "2024-03-09",
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
