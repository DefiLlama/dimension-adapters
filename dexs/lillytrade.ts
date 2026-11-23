import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../helpers/hyperliquid-v2";

// address hardcoded as the order builder in the lillytrade.xyz frontend; referrer code LILLY in its Hyperliquid referral state
const HL_BUILDER_ADDRESS = "0x363d5daaa6d2fb4b2fa3da864abd36169fd31a8d";
// https://lillytrade.xyz/#/season/1#fee-split: 99% of builder fees buy LILLY paid back to the traders, 1% covers gas
const CASHBACK_SHARE = 0.99;

const LABELS = {
  BUILDER_FEES: "Hyperliquid Builder Code Fees",
  CASHBACK: "Builder Code Fees To Traders As Cashback",
  PAYOUT_GAS: "Builder Code Fees To Cashback Payout Gas",
};

async function fetch(options: FetchOptions) {
  const { dailyVolume, dailyFees: builderFees } = await fetchBuilderCodeDataV2({ options, builderAddresses: [HL_BUILDER_ADDRESS], market: "perps" });
  const dailyFees = options.createBalances();
  dailyFees.add(builderFees, LABELS.BUILDER_FEES);
  const dailySupplySideRevenue = dailyFees.clone(CASHBACK_SHARE, LABELS.CASHBACK);
  dailySupplySideRevenue.add(dailyFees.clone(1 - CASHBACK_SHARE, LABELS.PAYOUT_GAS));
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-10-03",
  doublecounted: true,
  methodology: {
    Volume: "Notional volume of Hyperliquid perpetual trades (including HIP-3 markets) placed through LiLLyTrade with its builder code.",
    Fees: "Builder code fees paid by users on Hyperliquid perpetual trades placed through LiLLyTrade; excludes Hyperliquid's own trading fees and HIP-3 deployer fees.",
    Revenue: "None. All builder code fees go back to the traders as LILLY cashback.",
    ProtocolRevenue: "None. All builder code fees go back to the traders as LILLY cashback.",
    SupplySideRevenue: "All builder code fees: 99% buys LILLY paid pro rata to the traders who paid the fees, 1% pays the HyperEVM gas for those buybacks and payouts.",
  },
  breakdownMethodology: {
    Fees: { [LABELS.BUILDER_FEES]: "Builder code fees paid by users on Hyperliquid perpetual trades placed through LiLLyTrade." },
    SupplySideRevenue: {
      [LABELS.CASHBACK]: "99% of builder code fees, used to buy LILLY paid pro rata to the traders who paid the fees.",
      [LABELS.PAYOUT_GAS]: "1% of builder code fees, used to pay HyperEVM gas for the LILLY buybacks and cashback payouts.",
    },
  },
};

export default adapter;
