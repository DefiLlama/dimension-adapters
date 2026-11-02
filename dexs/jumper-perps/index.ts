import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../../helpers/hyperliquid-v2";
import { fetchLighterPartnerStats, LIGHTER_PARTNER_FEES_LABEL } from "../../helpers/lighter";

// Jumper Perps (https://jumper.exchange, https://x.com/jumperexchange): perpetual trades placed through Jumper on
// Hyperliquid (builder code) and Lighter (partner account). Each venue pays Jumper a fee on top of its own trading fees.

// Hyperliquid builder code supplied by the Jumper team, previously listed as jumper-perps-hl (perps) and jumper-perps-hl-spot (spot) in factory/hyperliquid.ts (PR #9827)
const HL_BUILDER_ADDRESSES = ["0x50d95d5823c5dc70d49599e9f120dfbbba93be56"];
const HL_BUILDER_FEES_LABEL = "Hyperliquid Builder Code Fees";

// Lighter partner account indexes supplied by the Jumper team, one per Lighter deployment
const chainConfig: Record<string, { start: string; lighterAccountIndex?: string }> = {
  [CHAIN.HYPERLIQUID]: { start: "2026-09-09" },
  [CHAIN.ZK_LIGHTER]: { start: "2026-09-06", lighterAccountIndex: "735353" },
  [CHAIN.ROBINHOOD]: { start: "2026-09-30", lighterAccountIndex: "37499" }, // Lighter on Robinhood Chain (dexs/lighter-rh)
};

const fetch = async (options: FetchOptions) => {
  const { lighterAccountIndex } = chainConfig[options.chain];
  let dailyVolume, dailyFees;
  if (lighterAccountIndex) {
    ({ dailyVolume, dailyFees } = await fetchLighterPartnerStats(options, lighterAccountIndex));
  } else {
    const data = await fetchBuilderCodeDataV2({ options, builderAddresses: HL_BUILDER_ADDRESSES, market: "perps" });
    dailyVolume = data.dailyVolume;
    dailyFees = options.createBalances();
    dailyFees.add(data.dailyFees, HL_BUILDER_FEES_LABEL);
  }
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

const adapter: SimpleAdapter = {
  version: 1, // the Hyperliquid indexer serves daily builder summaries
  fetch,
  adapter: chainConfig,
  doublecounted: true, // the trades are already counted in the Hyperliquid and Lighter listings
  methodology: {
    Volume: "Notional volume of perpetual trades placed through Jumper on Hyperliquid and Lighter.",
    Fees: "Builder code fees on Hyperliquid and partner fees on Lighter, paid by users on perpetual trades placed through Jumper.",
    Revenue: "All builder code and partner fees on perpetual trades placed through Jumper, kept by Jumper.",
    ProtocolRevenue: "All builder code and partner fees on perpetual trades placed through Jumper, sent to Jumper.",
  },
  breakdownMethodology: {
    Fees: {
      [HL_BUILDER_FEES_LABEL]: "Builder code fees paid by users on Hyperliquid perpetual trades placed through Jumper.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Partner fees paid by users on Lighter perpetual trades placed through Jumper.",
    },
    Revenue: {
      [HL_BUILDER_FEES_LABEL]: "Hyperliquid builder code fees, kept by Jumper.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Lighter partner fees, kept by Jumper.",
    },
    ProtocolRevenue: {
      [HL_BUILDER_FEES_LABEL]: "Hyperliquid builder code fees, sent to Jumper.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Lighter partner fees, sent to Jumper.",
    },
  },
};

export default adapter;
