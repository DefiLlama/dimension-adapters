// FrostyFi — Fees & Revenue adapter.
//
// FrostyFi (https://frostylabs.ai) is a no-code platform for building, deploying and
// monetizing AI agents on Base. Every product payment — Pro/Enterprise subscriptions,
// $5 pay-per-deploy, Architect builds and first-party x402 agent income — is pulled in
// USDC and split on-chain by the FrostyRevenueSplitter in a single transaction:
// operating / dev / protocol-owned-liquidity reserve / DAO buckets, plus a 3-level
// affiliate program paid from the same split.
//
// Splitter (source-verified): 0x5663213c20dd4d62E6f69ec240FE2f4e88B4dFd6
//
//   event PaymentSplit(uint8 indexed streamId, address indexed payer,
//                      address indexed subscriber, address referrer, uint256 amount)
//     — one event per product payment, `amount` = gross USDC entering the splitter.
//   event AffiliateCredited(address indexed referrer, uint8 level,
//                           address indexed subscriber, uint256 amount)
//     — the affiliate legs (6% / 2.5% / 1.5%) credited to third-party referrers;
//       when a payment has no referrer these legs roll into the protocol's
//       liquidity reserve instead (and no event is emitted).
//
//   => dailyFees              = Σ PaymentSplit.amount      [gross product payments]
//      dailySupplySideRevenue = Σ AffiliateCredited.amount [third-party referrer share]
//      dailyRevenue           = fees − affiliate           [protocol share: operating,
//                                                           dev, POL reserve, DAO]
//      dailyProtocolRevenue   = dailyRevenue
//
// Direct USDC donations to the splitter (accounted via `Swept`) are excluded — they
// are not payments for the product. FrostyFi takes 0% of third-party agents' x402
// income, so nothing here double-counts external agent earnings.

import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SPLITTER = "0x5663213c20dd4d62E6f69ec240FE2f4e88B4dFd6";
const USDC = ADDRESSES.base.USDC;

const PAYMENT_SPLIT =
  "event PaymentSplit(uint8 indexed streamId, address indexed payer, address indexed subscriber, address referrer, uint256 amount)";
const AFFILIATE_CREDITED =
  "event AffiliateCredited(address indexed referrer, uint8 level, address indexed subscriber, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const payments = await options.getLogs({ target: SPLITTER, eventAbi: PAYMENT_SPLIT });
  const affiliateLegs = await options.getLogs({ target: SPLITTER, eventAbi: AFFILIATE_CREDITED });

  let gross = 0n;
  let referral = 0n;
  for (const log of payments) gross += BigInt(log.amount);
  for (const log of affiliateLegs) referral += BigInt(log.amount);

  dailyFees.add(USDC, gross, "Product payments");
  dailySupplySideRevenue.add(USDC, referral, "Affiliate payouts");
  dailyRevenue.add(USDC, gross - referral, "Payments to operating, dev, POL reserve and DAO");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross USDC product payments (subscriptions, pay-per-deploy, Architect builds, first-party agent income) entering the on-chain revenue splitter, summed from PaymentSplit events.",
  Revenue: "The protocol's share of every payment — operating, dev, protocol-owned-liquidity reserve and DAO buckets — i.e. gross payments minus third-party affiliate payouts.",
  ProtocolRevenue: "Same as Revenue: all non-affiliate buckets are protocol-controlled.",
  SupplySideRevenue: "The 3-level affiliate share (6% / 2.5% / 1.5%) credited to third-party referrers, from AffiliateCredited events.",
};

const breakdownMethodology = {
  Fees: {
    "Product payments": "Gross USDC entering the FrostyRevenueSplitter via PaymentSplit events — subscriptions, pay-per-deploy, Architect builds and first-party agent income.",
  },
  Revenue: {
    "Payments to operating, dev, POL reserve and DAO": "Gross payments minus affiliate payouts — the operating, dev, POL reserve and DAO buckets.",
  },
  ProtocolRevenue: {
    "Payments to operating, dev, POL reserve and DAO": "Gross payments minus affiliate payouts — the operating, dev, POL reserve and DAO buckets.",
  },
  SupplySideRevenue: {
    "Affiliate payouts": "USDC credited to third-party referrers via AffiliateCredited events (3-level: 6% / 2.5% / 1.5%).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-07-26",
  methodology,
  breakdownMethodology,
};

export default adapter;
