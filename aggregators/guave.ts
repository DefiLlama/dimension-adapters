import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Guave: flat-fee DEX aggregator. Routes swaps through the KyberSwap
// MetaRouter, charging a flat ETH fee per trade-size tier via the
// FlatExRouter contract (name is on-chain/immutable). https://guave.trade
//
// FlatExRouter versions (all emit the same SwapExecuted event):
//   Arb  v5: 0x297370EeAAf8729407689Ef01d922A8015e611A2 (deployed 2026-11-25)
const chainConfig: Record<string, { targets: string[]; start: string }> = {
  [CHAIN.BASE]: {
    targets: [
      "0x94583743e729377367ccF6B7cC5a973A62be9e99", // v7
      "0x149D72CD1ff25e04891b8F320BcD9C1dCdb73eb5", // v2
      "0x9c4267674Eb221e9a523B64Be6a12129fA873AF7", // v3
      "0xc17414de6520544560C9b40EC8729F5e10c9e217", // v4
      "0x96504784D9bA3cC1c65ccEa30270f7515aD1C6Dc", // v5
      "0x9043CA05a8A47a9450A50f98B5Bd9826FE2351f4", // v6
    ],
    start: "2026-11-24",
  },
  [CHAIN.ARBITRUM]: {
    targets: [
      "0x428cD277fa23a073D5F4Cc39FA95196DE64bDaF9", // v7
      "0x297370EeAAf8729407689Ef01d922A8015e611A2", // v5
      "0x202AbA6b70f08C1770237a519693176A30532854", // v6
    ],
    start: "2026-11-25",
  },
  [CHAIN.ETHEREUM]: {
    targets: [
      "0x00d257E6B67370F4CfF49fE25d6c1A2e3DA452f6", // v7
      "0xa93F686B6c775B4e63Fb6162Edbc42dD3C9e32F1", // v5
      "0x202AbA6b70f08C1770237a519693176A30532854", // v6
    ],
    start: "2026-11-25",
  },
  [CHAIN.OPTIMISM]: {
    targets: [
      "0x3D888DDeDE57C995690b789b818cC4C4823aAEab", // v7
      "0x297370EeAAf8729407689Ef01d922A8015e611A2", // v6
    ],
    start: "2026-11-25",
  },
  [CHAIN.POLYGON]: {
    targets: [
      "0x00d257E6B67370F4CfF49fE25d6c1A2e3DA452f6", // v7
      "0x297370EeAAf8729407689Ef01d922A8015e611A2", // v6
    ],
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
    // feePaid is native ETH collected by the FlatEx FeeCollector contract.
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
    Volume: "Value of the tokens users sell in swaps made through Guave.",
    Fees: "Flat fee in ETH that users pay on each swap, set by the size of the trade.",
    Revenue: "All flat ETH swap fees paid by users, kept by Guave.",
    ProtocolRevenue: "All flat ETH swap fees paid by users, sent to the Guave fee collector.",
  },
  breakdownMethodology: {
    dailyFees: { "Swap Fees": "Flat ETH fee users pay on each swap, set by trade-size tier." },
    dailyRevenue: { "Swap Fees To Treasury": "All flat ETH swap fees, sent to the Guave fee collector." },
    dailyProtocolRevenue: { "Swap Fees To Treasury": "All flat ETH swap fees, sent to the Guave fee collector." },
  },
};

export default adapter;
