import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchDeepSwap, LABEL } from "../helpers/deep-liquidity";

// DeepSwap: DEEP's constant-product AMM (program HCrCy6bzHhZ1b6bXwQAucEFkKXyzYMh3hgAR8UPrYSEP),
// a fork of Raydium cp-swap. Tokens that graduate from the DEEP launchpad trade here, and
// anyone can open a pool for any other pair.
// Docs: https://docs.deepliquidity.fun/docs
//
// Every amount is read from the program's own events (helpers/deep-liquidity.ts): each swap
// reports its fee split by recipient, so no rate is assumed here.

const methodology = {
  Volume: "The quote-token side (SOL on a TOKEN/SOL pool) of every swap, before fees.",
  Fees: "Everything charged on DeepSwap: the swap fee (0.35% of a buy and 0.75% of a sell), the reward fee the pool charges on top of it (0% to 5%, fixed when the pool was created) and the flat fee in SOL to open a pool. Pools of graduated launchpad tokens are opened by the launchpad, which pays that fee out of the token's migration fee; it is reported with the launchpad, not here.",
  Revenue: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell) and the pool creation fees.",
  ProtocolRevenue: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell) and the pool creation fees, all paid into DEEP's on-chain fee vault, which pays 10% to the team that builds DEEP and 90% to the DEEP treasury.",
  SupplySideRevenue: "The liquidity providers' share of the swap fee (0.10% of each swap, left in the pool) and each pool's reward fee, paid in full to the pool's creator or, on a Holder Rewards pool, to the holders of the pool's token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SwapProtocolFees]: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell).",
    [LABEL.SwapLpFees]: "The liquidity providers' share of the swap fee (0.10% of each swap).",
    [LABEL.SwapCreatorRewards]: "The reward fee of Creator Rewards pools (a rate fixed when the pool was created, up to 5% of each swap).",
    [LABEL.SwapHolderRewards]: "The reward fee of Holder Rewards pools (a rate fixed when the pool was created, up to 5% of each swap).",
    [LABEL.PoolCreationFees]: "The flat fee in SOL to open a pool, except pools opened by the DEEP launchpad for graduated tokens.",
  },
  Revenue: {
    [LABEL.SwapProtocolFees]: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell).",
    [LABEL.PoolCreationFees]: "The flat fee in SOL to open a pool.",
  },
  ProtocolRevenue: {
    [LABEL.SwapProtocolFees]: "DEEP's share of the swap fee, paid into DEEP's fee vault.",
    [LABEL.PoolCreationFees]: "The flat fee in SOL to open a pool, paid into DEEP's fee vault.",
  },
  SupplySideRevenue: {
    [LABEL.SwapLpFees]: "The liquidity providers' share of the swap fee, left in the pool.",
    [LABEL.SwapCreatorRewards]: "Reward fees paid to the creators of Creator Rewards pools.",
    [LABEL.SwapHolderRewards]: "Reward fees paid to the holders of the token of Holder Rewards pools.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchDeepSwap,
  chains: [CHAIN.SOLANA],
  start: "2026-10-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
