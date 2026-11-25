import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAINS, fetchDay, orderRowsFor, rowsFor, START } from "../aggregators/picoswap/api";

// PicoSwap's swap fees (source and methodology: aggregators/picoswap/api.ts): the Relay app fee, as Relay recorded it
// paid on each swap. It is split: half funds the Rewards pool paid back to traders in USDC each season, half is
// PicoSwap's, out of which referrers earn their share on the swaps of wallets they invited (recorded per swap). The
// rewards and referral shares are supply side; PicoSwap keeps the rest. Fees on the direct 0x / Jupiter route are not
// counted (the source only has an estimate for them), nor are fees of Relay, 0x, Jupiter and the underlying venues.
// From 2026-11-24, PicoSwap's CoW Protocol partner fee on filled limit orders (0.1% of the fill, paid entirely to
// PicoSwap) is counted too; Jupiter limit orders and DCA carry no PicoSwap fee.
// PicoSwap's Hyperliquid builder fees are listed separately (picoswap-perps).
const SWAP_FEES = "Swap Fees";
const LIMIT_ORDER_FEES = "Limit Order Fees";
const REWARDS_POOL = "Swap Fees To Rewards Pool";
const REFERRERS = "Swap Fees To Referrers";
const PICOSWAP_SHARE = "Swap Fees To PicoSwap";
const LIMIT_ORDER_SHARE = "Limit Order Fees To PicoSwap";

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
  for (const { limit, dca } of orderRowsFor(options)) {
    const ordersFeesUsd = limit.feesUsd + dca.feesUsd;
    dailyFees.addUSDValue(ordersFeesUsd, LIMIT_ORDER_FEES);
    dailyRevenue.addUSDValue(ordersFeesUsd, LIMIT_ORDER_SHARE);
    dailyProtocolRevenue.addUSDValue(ordersFeesUsd, LIMIT_ORDER_SHARE);
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
    Fees: "PicoSwap's app fee on same-chain and cross-chain swaps routed through Relay (0.2%, 0.1% on major pairs, 0% between stablecoins; 0.5% on launch day 2026-11-15), plus its 0.1% partner fee on filled CoW Protocol limit orders since 2026-11-24; excludes swaps on the direct 0x / Jupiter route and the fees charged by Relay, 0x, Jupiter, CoW and the underlying DEXs.",
    Revenue: "PicoSwap's half of the Relay app fee after paying referrers, plus the full CoW limit order partner fee.",
    ProtocolRevenue: "PicoSwap's half of the Relay app fee after paying referrers, plus the full CoW limit order partner fee, kept by PicoSwap.",
    SupplySideRevenue: "Half of the Relay app fee, paid back to traders in USDC through the seasonal Rewards pool, plus the referral earnings paid to referrers out of PicoSwap's half.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: "PicoSwap's app fee on same-chain and cross-chain swaps routed through Relay.",
      [LIMIT_ORDER_FEES]: "PicoSwap's 0.1% partner fee on filled CoW Protocol limit orders, since 2026-11-24.",
    },
    Revenue: {
      [PICOSWAP_SHARE]: "PicoSwap's half of the Relay app fee, after referral earnings.",
      [LIMIT_ORDER_SHARE]: "The full CoW limit order partner fee, kept by PicoSwap.",
    },
    ProtocolRevenue: {
      [PICOSWAP_SHARE]: "PicoSwap's half of the Relay app fee, after referral earnings.",
      [LIMIT_ORDER_SHARE]: "The full CoW limit order partner fee, kept by PicoSwap.",
    },
    SupplySideRevenue: {
      [REWARDS_POOL]: "Half of the Relay app fee, paid back to traders in USDC each Rewards season.",
      [REFERRERS]: "Referral earnings paid to referrers on swaps by wallets they invited, out of PicoSwap's half.",
    },
  },
};

export default adapter;
