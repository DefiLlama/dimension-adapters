import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryHyperliquidSpotDeployerFeesV2 } from "../helpers/hyperliquid-v2";

const WAGYU_TOKENS: Record<string, string> = {
  XMR1: "monero",
  ZEC1: "zcash",
  TRX1: "tron",
  HXMR: "monero",
};

const XMR1_DEPEG_DATE = "2026-11-20"; // deployer wallet dumped 5.2M XMR1, price fell from ~$500 to ~$1

const METRICS = {
  SpotFees: "Spot Trading Fees In Wagyu Tokens",
  SpotFeesToWagyu: "Spot Trading Fees To Wagyu",
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const [token, cgId] of Object.entries(WAGYU_TOKENS)) {
    if (token === "XMR1" && options.dateString >= XMR1_DEPEG_DATE) continue;
    const fees = await queryHyperliquidSpotDeployerFeesV2(options, token);
    dailyFees.addCGToken(cgId, fees, METRICS.SpotFees);
    dailyRevenue.addCGToken(cgId, fees, METRICS.SpotFeesToWagyu);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const methodology = {
  Fees: "Hyperliquid spot trading fees paid in Wagyu's XMR1, HXMR, ZEC1 and TRX1 tokens, excluding builder-code fees. XMR1 fees are excluded from 2026-11-20, when XMR1 lost its peg to XMR; Wagyu relaunched XMR as HXMR on 2026-11-22. Excludes Wagyu's swap and bridge withdrawal fees, which settle off Hyperliquid and cannot be verified on-chain.",
  Revenue: "All Hyperliquid spot trading fees paid in XMR1, HXMR, ZEC1 and TRX1, which Wagyu keeps in full as the deployer of those tokens. Excludes Wagyu's swap and bridge withdrawal fees.",
  ProtocolRevenue: "All Hyperliquid spot trading fees paid in XMR1, HXMR, ZEC1 and TRX1, kept by Wagyu as the tokens' deployer. Excludes Wagyu's swap and bridge withdrawal fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.SpotFees]: "Trading fees paid in XMR1, HXMR, ZEC1 and TRX1 on their Hyperliquid spot pairs, excluding builder-code fees.",
  },
  Revenue: {
    [METRICS.SpotFeesToWagyu]: "Trading fees paid in XMR1, HXMR, ZEC1 and TRX1, kept in full by Wagyu as the tokens' HIP-1 deployer.",
  },
  ProtocolRevenue: {
    [METRICS.SpotFeesToWagyu]: "Trading fees paid in XMR1, HXMR, ZEC1 and TRX1, kept in full by Wagyu as the tokens' HIP-1 deployer.",
  },
};

const adapter: SimpleAdapter = {
  version: 1, // the Hyperliquid indexer serves daily summaries
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-12-18", // first day with spot fees paid in XMR1, deployed 2025-12-17
  methodology,
  breakdownMethodology,
};

export default adapter;
