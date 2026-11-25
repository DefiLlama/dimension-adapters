import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// FlatEx: flat-fee DEX aggregator on Base. Routes swaps through the 1inch
// AggregationRouter, charging a flat ETH fee per trade-size tier via the
// FlatExRouter contract. https://flatex.trade
//
// FlatExRouter versions (all emit the same SwapExecuted event):
//   Arb  v5: 0x297370EeAAf8729407689Ef01d922A8015e611A2 (deployed 2026-11-25)
const chainConfig: Record<string, { targets: string[]; start: string }> = {
  [CHAIN.BASE]: {
    targets: [
      "0x149D72CD1ff25e04891b8F320BcD9C1dCdb73eb5",
      "0x9c4267674Eb221e9a523B64Be6a12129fA873AF7",
      "0xc17414de6520544560C9b40EC8729F5e10c9e217",
      "0x96504784D9bA3cC1c65ccEa30270f7515aD1C6Dc",
    ],
    start: "2026-11-24",
  },
  [CHAIN.ARBITRUM]: {
    targets: ["0x297370EeAAf8729407689Ef01d922A8015e611A2"],
    start: "2026-11-25",
  },
};

const SWAP_EXECUTED =
  "event SwapExecuted(address indexed router, address indexed user, address srcToken, address dstToken, uint256 srcAmount, uint256 dstAmount, uint256 feePaid)";

const fetch = async ({ getLogs, createBalances, chain }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const logs = await getLogs({ targets: chainConfig[chain].targets, eventAbi: SWAP_EXECUTED });

  for (const log of logs) {
    dailyVolume.add(log.srcToken, log.srcAmount);
    // feePaid is native ETH collected by the FlatEx FeeCollector.
    dailyFees.addGasToken(log.feePaid, "Swap Fees");
    dailyRevenue.addGasToken(log.feePaid, "Swap Fees To Treasury");
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Value of the tokens users sell in swaps made through FlatEx.",
    Fees: "Flat fee in ETH that users pay on each swap, set by the size of the trade.",
    Revenue: "All flat ETH swap fees paid by users, kept by FlatEx.",
    ProtocolRevenue: "All flat ETH swap fees paid by users, sent to the FlatEx fee collector.",
  },
  breakdownMethodology: {
    dailyFees: { "Swap Fees": "Flat ETH fee users pay on each swap, set by trade-size tier." },
    dailyRevenue: { "Swap Fees To Treasury": "All flat ETH swap fees, sent to the FlatEx fee collector." },
    dailyProtocolRevenue: { "Swap Fees To Treasury": "All flat ETH swap fees, sent to the FlatEx fee collector." },
  },
};

export default adapter;
