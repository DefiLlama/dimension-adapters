import { SimpleAdapter } from "../../adapters/types";
import { LIGHTER_PARTNER_FEES_LABEL } from "../../helpers/lighter";
import { chainConfig, HL_BUILDER_FEES_LABEL, NADO_BUILDER_FEES_LABEL } from "./config";
import { fetch } from "./fetch";

// PerpPilot builder/partner volume and fees across venues: venue config in ./config.ts, data sources in ./fetch.ts

const adapter: SimpleAdapter = {
  version: 1, // the Hyperliquid indexer and the Extended dashboard serve daily builder summaries
  fetch,
  adapter: chainConfig,
  doublecounted: true, // the trades are already counted in the Hyperliquid, Lighter, Extended and Nado listings
  methodology: {
    Volume: "Notional volume of perpetual trades placed by PerpPilot bots on Hyperliquid, Lighter, Lighter on Robinhood Chain, Extended and Nado, as attributed to PerpPilot's builder code by each venue.",
    Fees: "Builder code fees on Hyperliquid and Nado and partner fees on Lighter, paid by users on perpetual trades placed through PerpPilot; Extended builder fees are not publicly reported and are excluded.",
    Revenue: "All builder code and partner fees on perpetual trades placed through PerpPilot, kept by PerpPilot.",
    ProtocolRevenue: "All builder code and partner fees on perpetual trades placed through PerpPilot, sent to PerpPilot.",
  },
  breakdownMethodology: {
    Fees: {
      [HL_BUILDER_FEES_LABEL]: "Builder code fees paid by users on Hyperliquid perpetual trades placed through PerpPilot.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Partner fees paid by users on Lighter and Lighter on Robinhood Chain perpetual trades placed through PerpPilot.",
      [NADO_BUILDER_FEES_LABEL]: "Builder fees paid by users on Nado perpetual trades placed through PerpPilot.",
    },
    Revenue: {
      [HL_BUILDER_FEES_LABEL]: "Hyperliquid builder code fees, kept by PerpPilot.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Lighter partner fees, kept by PerpPilot.",
      [NADO_BUILDER_FEES_LABEL]: "Nado builder fees, kept by PerpPilot.",
    },
    ProtocolRevenue: {
      [HL_BUILDER_FEES_LABEL]: "Hyperliquid builder code fees, sent to PerpPilot.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Lighter partner fees, sent to PerpPilot.",
      [NADO_BUILDER_FEES_LABEL]: "Nado builder fees, sent to PerpPilot.",
    },
  },
};

export default adapter;
