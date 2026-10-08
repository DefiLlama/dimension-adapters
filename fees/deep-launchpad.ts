import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchDeepLaunchpad, LABEL } from "../helpers/deep-liquidity";

// DEEP launchpad: tokens launch on a bonding curve (the Deep Curve program,
// 7czURwVLkQpcF1HVhhZU5GGzvPA8YniogZY1BhZHCDtA) and trade there against SOL until the curve is
// sold out; the liquidity then moves to a DeepSwap pool (the `deepswap` adapters).
// Docs: https://docs.deepliquidity.fun/docs
//
// Every amount is read from the program's own events (helpers/deep-liquidity.ts). A token's
// fee rates are fixed at its launch and stored on its curve, so no rate is assumed here.

const methodology = {
  Volume: "SOL paid by buyers and SOL paid out to sellers on the bonding curves, before fees.",
  Fees: "Everything charged on the launchpad: DEEP's fee on each bonding-curve buy and sell (1.25%), the reward fee a token's creator chose at launch (0% to 5% of each trade), the fee to launch a token ($2, paid in SOL) and the migration fee taken from the SOL a curve raised when its token graduates (1%, less the network rent of the new pool's accounts).",
  Revenue: "DEEP's share: its 1.25% fee on bonding-curve trades, the token launch fees and the migration fees. Reward fees are not included.",
  ProtocolRevenue: "DEEP's 1.25% fee on bonding-curve trades, the token launch fees and the migration fees, all paid into DEEP's on-chain fee vault, which pays 10% to the team that builds DEEP and 90% to the DEEP treasury.",
  SupplySideRevenue: "The reward fee of each token, paid in full to the token's creator or, for a Holder Rewards token, to the holders of that token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%).",
    [LABEL.CurveCreatorRewards]: "The reward fee of Creator Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.CurveHolderRewards]: "The reward fee of Holder Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.LaunchFees]: "The fee to launch a token ($2, paid in SOL at the Pyth SOL/USD price).",
    [LABEL.MigrationFees]: "The part of the SOL a curve raised that DEEP keeps when the token graduates to DeepSwap (1%, less the network rent of the new pool's accounts).",
  },
  Revenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%).",
    [LABEL.LaunchFees]: "The fee to launch a token.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates.",
  },
  ProtocolRevenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%), paid into DEEP's fee vault.",
    [LABEL.LaunchFees]: "The fee to launch a token, paid into DEEP's fee vault.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates, paid into DEEP's fee vault.",
  },
  SupplySideRevenue: {
    [LABEL.CurveCreatorRewards]: "Reward fees paid to the creators of Creator Rewards tokens.",
    [LABEL.CurveHolderRewards]: "Reward fees paid to the holders of Holder Rewards tokens.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchDeepLaunchpad,
  chains: [CHAIN.SOLANA],
  start: "2026-10-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
