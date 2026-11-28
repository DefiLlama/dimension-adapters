import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAINS, fetchDay, orderRowsFor, rowsFor, START } from "../aggregators/picoswap/api";

// PicoSwap's swap fees (source and methodology: aggregators/picoswap/api.ts): the Relay app fee, as Relay recorded it
// paid on each swap, split into the wallets it is paid to. From V9_START (PicoSwap's weekly cashback rules): 70% goes
// back to the trader in USDC every week, 20% to whoever invited them (with no inviter PicoSwap keeps it), 10% to
// PicoSwap. Before that: half funded a seasonal Rewards pool paid back to traders, half was PicoSwap's, out of which
// referrers earned their share. The trader and referrer shares are supply side; PicoSwap keeps the rest. The source
// records what each wallet actually received per swap, so the split follows the rules in force that day.
// Fees on the direct 0x / Jupiter route are not
// counted (the source only has an estimate for them), nor are fees of Relay, 0x, Jupiter and the underlying venues.
// From 2026-11-24, PicoSwap's CoW Protocol partner fee on filled limit orders (0.1% of the fill) is counted too: all of
// it was PicoSwap's until V9_START; from then 70% goes back to the trader (an inviter's share is not split out by the
// source, so it stays in revenue). Jupiter limit orders and DCA carry no PicoSwap fee.
// PicoSwap's Hyperliquid builder fees are listed separately (picoswap-perps).
const SWAP_FEES = "Swap Fees";
const LIMIT_ORDER_FEES = "Limit Order Fees";
const REWARDS_POOL = "Swap Fees To Rewards Pool";
const REFERRERS = "Swap Fees To Referrers";
const PICOSWAP_SHARE = "Swap Fees To PicoSwap";
const LIMIT_ORDER_SHARE = "Limit Order Fees To PicoSwap";
const LIMIT_ORDER_CASHBACK = "Limit Order Fees To Traders";
// PicoSwap's weekly cashback rules start on this day (00:00 UTC).
const V9_START = "2026-12-01";
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
  const v9 = new Date(options.startOfDay * 1000).toISOString().slice(0, 10) >= V9_START;
  for (const { limit, dca } of orderRowsFor(options)) {
    const ordersFeesUsd = limit.feesUsd + dca.feesUsd;
    const toTraders = v9 ? ordersFeesUsd * ORDER_TRADER_SHARE : 0;
    dailyFees.addUSDValue(ordersFeesUsd, LIMIT_ORDER_FEES);
    if (toTraders) dailySupplySideRevenue.addUSDValue(toTraders, LIMIT_ORDER_CASHBACK);
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
    Revenue: "PicoSwap's part of the Relay app fee after paying referrers (30% of the fee from 2026-12-01, half before), plus PicoSwap's part of the CoW limit order partner fee (30% from 2026-12-01, all of it before).",
    ProtocolRevenue: "Same as Revenue, kept by PicoSwap.",
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
