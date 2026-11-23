import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAINS, fetchDay, rowsFor, START } from "../aggregators/picoswap/api";

// PicoSwap's swap fees (source and methodology: aggregators/picoswap/api.ts): the Relay app fee, as Relay recorded it
// paid on each swap. It is split: half funds the Rewards pool paid back to traders in USDC each season, half is
// PicoSwap's, out of which referrers earn their share on the swaps of wallets they invited (recorded per swap). The
// rewards and referral shares are supply side; PicoSwap keeps the rest. Fees on the direct 0x / Jupiter route are not
// counted (the source only has an estimate for them), nor are fees of Relay, 0x, Jupiter and the underlying venues.
// PicoSwap's Hyperliquid builder fees are listed separately (picoswap-perps).
const SWAP_FEES = "Swap Fees";
const REWARDS_POOL = "Swap Fees To Rewards Pool";
const REFERRERS = "Swap Fees To Referrers";
const PICOSWAP_SHARE = "Swap Fees To PicoSwap";

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
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: fetchDay as any,
  chains: CHAINS,
  start: START,
  methodology: {
    Fees: "PicoSwap's app fee on swaps through Relay (0.2%, 0.1% on major pairs, 0% between stablecoins; 0.5% on 2026-11-15), as Relay recorded it paid on each swap in PicoSwap's Relay request ledger. Fees on the direct 0x / Jupiter route are not included.",
    Revenue: "PicoSwap's half of the Relay app fee, less the referral earnings owed on those swaps.",
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue: "Half of the Relay app fee, paid into the Rewards pool and back to traders in USDC each season, plus the referral earnings (levels 1 and 2) owed to referrers out of PicoSwap's half.",
  },
  breakdownMethodology: {
    Fees: { [SWAP_FEES]: "PicoSwap's app fee on Relay swaps, as recorded per swap." },
    Revenue: { [PICOSWAP_SHARE]: "PicoSwap's half of the Relay app fee, less referral earnings." },
    ProtocolRevenue: { [PICOSWAP_SHARE]: "PicoSwap's half of the Relay app fee, less referral earnings." },
    SupplySideRevenue: {
      [REWARDS_POOL]: "Half of the Relay app fee, paid back to traders as USDC Rewards.",
      [REFERRERS]: "Referral earnings owed to referrers on the swaps of wallets they invited, out of PicoSwap's half.",
    },
  },
};

export default adapter;
