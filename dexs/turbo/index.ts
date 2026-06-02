import { uniV3Exports } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";

// Turbo is a Uniswap V3 fork DEX on HyperEVM (chain 999).
// Volume is the USD value of all swaps across Turbo's pools, discovered from
// the same factory's PoolCreated events as the TVL adapter and summed from
// on-chain Swap events. (This is the DEX's own pool volume, the same number
// the app surfaces, not the smaller router-routed subset.)
export default uniV3Exports(
  {
    [CHAIN.HYPERLIQUID]: {
      factory: "0xc72d2695A203696243Aa3EdD6CC98E43262E007E",
      start: "2026-05-30",
      userFeesRatio: 1,       // traders pay 100% of the swap fee
      revenueRatio: 0,        // Turbo takes no protocol cut; all fees go to LPs
      protocolRevenueRatio: 0,
    },
  },
  {
    methodology: {
      Volume: "USD value of all swaps across Turbo's Uniswap V3 pools on HyperEVM, summed from on-chain Swap events.",
      Fees: "Swap fees paid by traders (each pool's fee tier applied to its swap volume).",
      UserFees: "Swap fees paid by traders.",
      Revenue: "Turbo charges no protocol fee, so protocol revenue is zero.",
      ProtocolRevenue: "Turbo charges no protocol fee, so protocol revenue is zero.",
      SupplySideRevenue: "All swap fees accrue to liquidity providers.",
    },
  }
);
