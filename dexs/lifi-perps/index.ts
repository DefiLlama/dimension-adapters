import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../../helpers/hyperliquid-v2";
import { fetchLighterPartnerStats, LIGHTER_PARTNER_FEES_LABEL } from "../../helpers/lighter";

// LI.FI perps (https://li.fi, https://x.com/lifiprotocol): perpetual trades routed through LI.FI to Hyperliquid and Lighter.
// Each venue tags the routed trades with LI.FI's builder code / partner account and pays LI.FI a fee on top of its own trading fees.

// Hyperliquid builder code supplied by the LI.FI team, previously listed as jumper-perps-hl in factory/hyperliquid.ts (PR #9827)
const HL_BUILDER_ADDRESSES = ["0x50d95d5823c5dc70d49599e9f120dfbbba93be56"];
const HL_BUILDER_FEES_LABEL = "Hyperliquid Builder Code Fees";

// Lighter partner account indexes supplied by the LI.FI team, one per Lighter deployment
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
    Volume: "Notional volume of perpetual trades routed through LI.FI to Hyperliquid, Lighter and Lighter on Robinhood Chain, as attributed by each venue to LI.FI's builder code or partner account.",
    Fees: "Builder code fees on Hyperliquid and partner fees on Lighter, paid by users on top of the venues' own trading fees for perpetual trades routed through LI.FI.",
    Revenue: "All builder code fees on Hyperliquid and partner fees on Lighter for perpetual trades routed through LI.FI, kept by LI.FI.",
    ProtocolRevenue: "All builder code fees on Hyperliquid and partner fees on Lighter for perpetual trades routed through LI.FI, sent to LI.FI.",
  },
  breakdownMethodology: {
    Fees: {
      [HL_BUILDER_FEES_LABEL]: "Builder code fees paid by users on Hyperliquid perpetual trades routed through LI.FI.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Partner fees paid by users on Lighter and Lighter on Robinhood Chain perpetual trades routed through LI.FI.",
    },
    Revenue: {
      [HL_BUILDER_FEES_LABEL]: "Hyperliquid builder code fees, kept by LI.FI.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Lighter partner fees, kept by LI.FI.",
    },
    ProtocolRevenue: {
      [HL_BUILDER_FEES_LABEL]: "Hyperliquid builder code fees, sent to LI.FI.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Lighter partner fees, sent to LI.FI.",
    },
  },
};

export default adapter;
