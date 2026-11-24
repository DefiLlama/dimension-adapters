import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// FlatEx: flat-fee DEX aggregator on Base. Routes swaps through the 1inch
// AggregationRouter, charging a flat ETH fee per trade-size tier via the
// FlatExRouter contract. https://flatex.trade
//
// FlatExRouter versions (all emit the same SwapExecuted event):
//   v2: 0x149D72CD1ff25e04891b8F320BcD9C1dCdb73eb5 (deployed 2026-11-24)
//   v3: 0x9c4267674Eb221e9a523B64Be6a12129fA873AF7 (deployed 2026-11-24)
//   v4: 0xc17414de6520544560C9b40EC8729F5e10c9e217 (deployed 2026-11-24)
const ROUTERS = [
  "0x149D72CD1ff25e04891b8F320BcD9C1dCdb73eb5",
  "0x9c4267674Eb221e9a523B64Be6a12129fA873AF7",
  "0xc17414de6520544560C9b40EC8729F5e10c9e217",
];

const SWAP_EXECUTED =
  "event SwapExecuted(address indexed router, address indexed user, address srcToken, address dstToken, uint256 srcAmount, uint256 dstAmount, uint256 feePaid)";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const logs = await getLogs({ targets: ROUTERS, eventAbi: SWAP_EXECUTED });

  for (const log of logs) {
    dailyVolume.add(log.srcToken, log.srcAmount, "Swap Volume");
    // feePaid is native ETH collected by the FlatEx FeeCollector.
    dailyFees.addGasToken(log.feePaid, "Swap Fees");
    dailyRevenue.addGasToken(log.feePaid, "Swap Fees To Treasury");
  }

  return { dailyVolume, dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  // First FlatExRouter deployment on Base: 2026-11-24.
  start: "2026-11-24",
  methodology: {
    Volume:
      "Value of the source tokens users sell in swaps routed through FlatExRouter on Base, counted once per swap.",
    Fees: "Flat ETH fee paid by the user per swap, sized by trade-size tier.",
    Revenue: "All fees are sent to the FlatEx FeeCollector owned by the protocol.",
  },
  breakdownMethodology: {
    dailyVolume: { "Swap Volume": "Source-token value of each SwapExecuted event." },
    dailyFees: { "Swap Fees": "ETH fee (msg.value) forwarded to the FeeCollector per swap." },
    dailyRevenue: { "Swap Fees To Treasury": "Same fees; 100% accrues to the protocol-owned FeeCollector." },
  },
};

export default adapter;
