import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAINS, fetchDay, orderRowsFor, rowsFor, START } from "../aggregators/picoswap/api";

// Source: aggregators/picoswap/api.ts. It records the Relay fee each wallet received per swap, so that split follows the
// rules in force that day. Direct 0x / Jupiter route fees are not counted (the source only has an estimate for them).
// Limit-order fees are not split by wallet; the inviter's share stays in revenue.
// Hyperliquid builder fees: dexs/picoswap-perps and dexs/picoswap-spot.
const SWAP_FEES = "Swap Fees";
const LIMIT_ORDER_FEES = "Limit Order Fees";
const REWARDS_POOL = "Swap Fees To Rewards Pool";
const REFERRERS = "Swap Fees To Referrers";
const PICOSWAP_SHARE = "Swap Fees To PicoSwap";
const LIMIT_ORDER_SHARE = "Limit Order Fees To PicoSwap";
const LIMIT_ORDER_CASHBACK = "Limit Order Fees To Traders";
// https://picoswap.xyz/docs/trading/fees: from this day 70% of limit-order fees go back to the trader as weekly USDC cashback
const CASHBACK_START = "2026-12-01";
const ORDER_TRADER_SHARE = 0.7;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const { relay } of rowsFor(options)) {
    const { rewardsPoolUsd, picoswapUsd, referralsUsd } = relay.fees;
    dailyFees.addUSDValue(rewardsPoolUsd + picoswapUsd, SWAP_FEES);
    dailySupplySideRevenue.addUSDValue(rewardsPoolUsd, REWARDS_POOL);
    dailySupplySideRevenue.addUSDValue(referralsUsd, REFERRERS);
    dailyRevenue.addUSDValue(picoswapUsd - referralsUsd, PICOSWAP_SHARE);
    dailyProtocolRevenue.addUSDValue(picoswapUsd - referralsUsd, PICOSWAP_SHARE);
  }
  const traderShare = options.dateString >= CASHBACK_START ? ORDER_TRADER_SHARE : 0;
  for (const { limit, dca } of orderRowsFor(options)) {
    const ordersFeesUsd = limit.feesUsd + dca.feesUsd;
    const toTraders = ordersFeesUsd * traderShare;
    dailyFees.addUSDValue(ordersFeesUsd, LIMIT_ORDER_FEES);
    dailySupplySideRevenue.addUSDValue(toTraders, LIMIT_ORDER_CASHBACK);
    dailyRevenue.addUSDValue(ordersFeesUsd - toTraders, LIMIT_ORDER_SHARE);
    dailyProtocolRevenue.addUSDValue(ordersFeesUsd - toTraders, LIMIT_ORDER_SHARE);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: fetchDay as any,
  chains: CHAINS,
  start: START,
  methodology: {
    Fees: "PicoSwap's app fee on same-chain and cross-chain swaps routed through Relay (0.2%, 0.05% on major pairs, 0% between stablecoins; 0.5% on launch day 2026-11-15), plus its 0.1% partner fee on filled CoW Protocol limit orders since 2026-11-24; excludes swaps on the direct 0x / Jupiter route and the fees charged by Relay, 0x, Jupiter, CoW and the underlying DEXs.",
    Revenue: "PicoSwap's part of the Relay app fee (30% from 2026-12-01, half before) minus the referral earnings it pays out of it, plus PicoSwap's part of the CoW limit order partner fee (30% from 2026-12-01, including the inviter share; all of it before).",
    ProtocolRevenue: "PicoSwap's part of the Relay app fee (30% from 2026-12-01, half before) minus referral earnings, plus its part of the CoW limit order partner fee (30% from 2026-12-01, all of it before), kept by PicoSwap.",
    SupplySideRevenue: "The part of the Relay app fee paid back to traders in USDC (70% as weekly cashback from 2026-12-01; half, through a seasonal Rewards pool, before), plus referral earnings, plus 70% of the CoW limit order fee paid back to traders from 2026-12-01.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: "PicoSwap's app fee on same-chain and cross-chain swaps routed through Relay.",
      [LIMIT_ORDER_FEES]: "PicoSwap's 0.1% partner fee on filled CoW Protocol limit orders, since 2026-11-24.",
    },
    Revenue: {
      [PICOSWAP_SHARE]: "PicoSwap's part of the Relay app fee, after referral earnings.",
      [LIMIT_ORDER_SHARE]: "PicoSwap's part of the CoW limit order partner fee (all of it before 2026-12-01, 30% from then).",
    },
    ProtocolRevenue: {
      [PICOSWAP_SHARE]: "PicoSwap's part of the Relay app fee, after referral earnings.",
      [LIMIT_ORDER_SHARE]: "PicoSwap's part of the CoW limit order partner fee (all of it before 2026-12-01, 30% from then).",
    },
    SupplySideRevenue: {
      [REWARDS_POOL]: "The part of the Relay app fee paid back to traders in USDC: 70% as weekly cashback from 2026-12-01, half through a seasonal Rewards pool before.",
      [REFERRERS]: "Referral earnings paid to referrers on swaps by wallets they invited (20% of the fee from 2026-12-01).",
      [LIMIT_ORDER_CASHBACK]: "70% of the CoW limit order partner fee, paid back to traders in USDC from 2026-12-01.",
    },
  },
};

export default adapter;
