import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { launchFees, levFlows, poolSplits, poolTrades, START } from "../../helpers/perpsplexity";

// Pool and leveraged token package lines and ids live in helpers/perpsplexity.ts (one list shared with the volume adapter).
const CREATOR_BPS = 1000n; // composite_pool::CREATOR_BPS / pool::CREATOR_BPS: 10% of every trade fee, carved out of the dividend share
const LAUNCH_FEES = "Launch Fees";
const SWAP_TO_PROTOCOL = "Swap Fees To Protocol";
const SWAP_TO_TREASURY = "Swap Fees To Pool Treasury";
const SWAP_TO_DIVIDENDS = "Swap Fees To Holder Dividends";
const SWAP_TO_CREATORS = "Swap Fees To Creators";
const MINT_REDEEM_TO_PROTOCOL = "Mint/Redeem Fees To Protocol";
const MINT_REDEEM_TO_REFERRERS = "Mint/Redeem Fees To Referrers";
const MANAGEMENT_TO_PROTOCOL = "Management Fees To Protocol";
const LAUNCH_TO_PROTOCOL = "Launch Fees To Protocol";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Pool trade fees, split exactly as route_fee does: treasury_bps to the pool treasury, the creator's 10%,
  // the rest of dividend_bps to holder dividends, the remainder (platform_bps) to the protocol.
  const [trades, splits] = await Promise.all([poolTrades(options), poolSplits()]);
  for (const t of trades) {
    if (t.fee === 0n) continue;
    const s = splits[t.deployment.original];
    const creatorBps = s.dividend > CREATOR_BPS ? CREATOR_BPS : 0n;
    const treasury = (t.fee * s.treasury) / 10000n;
    const creator = (t.fee * creatorBps) / 10000n;
    const dividends = (t.fee * (s.dividend - creatorBps)) / 10000n;
    const platform = t.fee - treasury - creator - dividends;
    dailyFees.add(t.quote, t.fee, METRIC.SWAP_FEES);
    dailyRevenue.add(t.quote, platform, SWAP_TO_PROTOCOL);
    dailySupplySideRevenue.add(t.quote, treasury, SWAP_TO_TREASURY);
    dailySupplySideRevenue.add(t.quote, dividends, SWAP_TO_DIVIDENDS);
    dailySupplySideRevenue.add(t.quote, creator, SWAP_TO_CREATORS);
  }

  // Launch fees (SUI) go to the platform.
  for (const f of await launchFees(options)) {
    dailyFees.add(f.coin, f.amount, LAUNCH_FEES);
    dailyRevenue.add(f.coin, f.amount, LAUNCH_TO_PROTOCOL);
  }

  // Leveraged tokens: mint/redeem fees (referrer share to referrers, the rest to the protocol) and streaming fees (all protocol).
  for (const f of await levFlows(options)) {
    if (f.fee === 0n) continue;
    if (f.kind === "streaming") {
      dailyFees.add(f.quote, f.fee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.add(f.quote, f.fee, MANAGEMENT_TO_PROTOCOL);
      continue;
    }
    dailyFees.add(f.quote, f.fee, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.add(f.quote, f.fee - f.referral, MINT_REDEEM_TO_PROTOCOL);
    dailySupplySideRevenue.add(f.quote, f.referral, MINT_REDEEM_TO_REFERRERS);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid on buys and sells of Perpsplexity pool tokens, mint and redeem fees and the yearly streaming fee of leveraged tokens, and the SUI fee paid to launch a pool.",
  UserFees: "Trading fees paid on buys and sells of Perpsplexity pool tokens, mint and redeem fees and the yearly streaming fee of leveraged tokens, and the SUI fee paid to launch a pool.",
  Revenue: "The platform share of pool trading fees (15%), leveraged token mint, redeem and streaming fees after referral payouts, and pool launch fees, all kept by the protocol.",
  ProtocolRevenue: "The platform share of pool trading fees (15%), leveraged token mint, redeem and streaming fees after referral payouts, and pool launch fees, all sent to the protocol's fee wallet.",
  SupplySideRevenue: "The share of pool trading fees that stays with each pool (50% to its treasury, which funds its backing), goes to the pool's holders as dividends (25%) or to the pool's creator (10%), plus the 20% of leveraged token mint and redeem fees paid to referrers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fee on every buy and sell of a pool token: the buy fee and the sell exit fee (which falls from 5% to 0.5% the longer the tokens were held).",
    [METRIC.MINT_REDEEM_FEES]: "Fee charged when a leveraged token is minted or redeemed.",
    [METRIC.MANAGEMENT_FEES]: "Streaming fee of leveraged tokens, accrued as tokens over time and paid out in USDC when collected.",
    [LAUNCH_FEES]: "SUI fee paid to the launchpad to launch or adopt a pool.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Fee on every buy and sell of a pool token: the buy fee and the sell exit fee (which falls from 5% to 0.5% the longer the tokens were held).",
    [METRIC.MINT_REDEEM_FEES]: "Fee charged when a leveraged token is minted or redeemed.",
    [METRIC.MANAGEMENT_FEES]: "Streaming fee of leveraged tokens, accrued as tokens over time and paid out in USDC when collected.",
    [LAUNCH_FEES]: "SUI fee paid to the launchpad to launch or adopt a pool.",
  },
  Revenue: {
    [SWAP_TO_PROTOCOL]: "Platform share (platform_bps, 15%) of pool trading fees.",
    [MINT_REDEEM_TO_PROTOCOL]: "Leveraged token mint and redeem fees left after the referrer's share.",
    [MANAGEMENT_TO_PROTOCOL]: "Leveraged token streaming fees, all kept by the protocol.",
    [LAUNCH_TO_PROTOCOL]: "Pool launch fees, all kept by the protocol.",
  },
  ProtocolRevenue: {
    [SWAP_TO_PROTOCOL]: "Platform share (platform_bps, 15%) of pool trading fees.",
    [MINT_REDEEM_TO_PROTOCOL]: "Leveraged token mint and redeem fees left after the referrer's share.",
    [MANAGEMENT_TO_PROTOCOL]: "Leveraged token streaming fees, all kept by the protocol.",
    [LAUNCH_TO_PROTOCOL]: "Pool launch fees, all kept by the protocol.",
  },
  SupplySideRevenue: {
    [SWAP_TO_TREASURY]: "Treasury share (treasury_bps, 50%) of pool trading fees, kept in the pool to fund its backing position.",
    [SWAP_TO_DIVIDENDS]: "Dividend share (dividend_bps 35% minus the creator's 10%) of pool trading fees, paid to the pool's token holders.",
    [SWAP_TO_CREATORS]: "Creator share (10%) of pool trading fees, paid to whoever launched the pool.",
    [MINT_REDEEM_TO_REFERRERS]: "Referral share (referral_bps, 20%) of leveraged token mint and redeem fees, paid to the trader's referrer.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // events come from Sui GraphQL in the [startTimestamp, endTimestamp) window, so hourly pulls work
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
