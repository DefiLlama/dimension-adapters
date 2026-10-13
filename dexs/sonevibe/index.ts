import { uniV2Exports } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";

// VibeSwap (SoneVibe): Uniswap V2 fork, 0.25% swap fee.
// Factory feeTo is set, so 1/6 of the fee (~0.0417%) is minted as LP to the protocol, 5/6 to LPs.
export default {
  ...uniV2Exports({
    [CHAIN.SONEIUM]: {
      factory: "0x06C0b58287794a0bdce20ce768b601CA974618DC",
      fees: 0.0025,
      userFeesRatio: 1,
      revenueRatio: 1 / 6,
      protocolRevenueRatio: 1 / 6,
      start: "2025-12-15",
      allowReadPairs: true, // small factory; also works before the TVL adapter cache exists
    },
  }),
  methodology: {
    Volume: "Volume is calculated from Swap events on VibeSwap pairs created by the VibeFactory.",
    Fees: "Each swap pays a 0.25% fee.",
    UserFees: "Users pay a 0.25% fee on each swap.",
    Revenue: "1/6 of swap fees (~0.0417%) accrue to the protocol via the factory feeTo LP mint.",
    ProtocolRevenue: "1/6 of swap fees (~0.0417%) go to the protocol feeTo address.",
    SupplySideRevenue: "5/6 of swap fees (~0.2083%) go to liquidity providers.",
  },
};
