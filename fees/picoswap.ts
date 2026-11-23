import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAINS, fetchDay, rowsFor, START } from "../aggregators/picoswap/api";

// PicoSwap's swap fees (source and methodology: aggregators/picoswap/api.ts). On Relay swaps the app fee is split:
// half funds the Rewards pool paid back to traders in USDC each season (supply side), half is PicoSwap's own, which
// also pays its referrers. On direct 0x / Jupiter swaps the whole fee is PicoSwap's. Fees of Relay, 0x, Jupiter and the
// underlying venues are not included. PicoSwap's Hyperliquid builder fees are listed separately (picoswap-perps).
const SWAP_FEES = "Swap Fees";
const REWARDS_POOL = "Swap Fees To Rewards Pool";
const PICOSWAP_SHARE = "Swap Fees To PicoSwap";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const { relay, direct } of rowsFor(options)) {
    const kept = relay.fees.picoswapUsd + direct.feesUsd;
    dailyFees.addUSDValue(relay.fees.rewardsPoolUsd + kept, SWAP_FEES);
    dailySupplySideRevenue.addUSDValue(relay.fees.rewardsPoolUsd, REWARDS_POOL);
    dailyRevenue.addUSDValue(kept, PICOSWAP_SHARE);
    dailyProtocolRevenue.addUSDValue(kept, PICOSWAP_SHARE);
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
    Fees: "PicoSwap's app fee on swaps through Relay (0.2%, 0.1% on major pairs, 0% between stablecoins; 0.5% on 2026-11-15), as recorded per swap in PicoSwap's Relay request ledger, plus PicoSwap's fee on its direct 0x / Jupiter swaps (estimated from the recorded fee rate).",
    Revenue: "PicoSwap's share: half of the Relay app fee (which also pays PicoSwap's referrers) and the whole fee on direct 0x / Jupiter swaps.",
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue: "Half of the Relay app fee, paid into the Rewards pool and back to traders in USDC each season.",
  },
  breakdownMethodology: {
    Fees: { [SWAP_FEES]: "PicoSwap's app fee on Relay swaps and its fee on direct 0x / Jupiter swaps." },
    Revenue: { [PICOSWAP_SHARE]: "PicoSwap's half of the Relay app fee and its fee on direct 0x / Jupiter swaps." },
    ProtocolRevenue: { [PICOSWAP_SHARE]: "PicoSwap's half of the Relay app fee and its fee on direct 0x / Jupiter swaps." },
    SupplySideRevenue: { [REWARDS_POOL]: "Half of the Relay app fee, paid back to traders as USDC Rewards." },
  },
};

export default adapter;
