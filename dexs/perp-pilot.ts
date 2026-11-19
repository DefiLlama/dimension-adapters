import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { fetchBuilderCodeDataV2 } from "../helpers/hyperliquid-v2";
import { fetchLighterPartnerStats, LIGHTER_PARTNER_FEES_LABEL } from "../helpers/lighter";

// PerpPilot (https://perppilot.io, https://x.com/PerpPilot_io): automated perp trading bots that place orders with
// PerpPilot's builder/partner code on Hyperliquid, Lighter, Nado and Extended. Each venue charges PerpPilot's fee on top of
// its own trading fee. One wallet, 0xc5be9a8d99f7b508fcf24f4c9dbf39e5f584f708, is the Hyperliquid builder, owns both Lighter
// partner accounts (/api/v1/accountsByL1Address) and owns Nado builder 4300 (getBuilder(4300) on Ink).

const HL_BUILDER_ADDRESS = "0xc5be9a8d99f7b508fcf24f4c9dbf39e5f584f708";
const HL_BUILDER_FEES_LABEL = "Hyperliquid Builder Code Fees";

const NADO_OFFCHAIN_EXCHANGE = "0x8373C3Aa04153aBc0cfD28901c3c971a946994ab";
const NADO_BUILDER_ID = 4300;
const NADO_BUILDER_FEES_LABEL = "Nado Builder Fees";

const EXTENDED_BUILDER_NAME = "PerpPilot";

const chainConfig: Record<string, { start: string; venue: "hyperliquid" | "lighter" | "nado" | "extended"; lighterAccountIndex?: string }> = {
  [CHAIN.HYPERLIQUID]: { start: "2026-05-03", venue: "hyperliquid" },
  [CHAIN.ZK_LIGHTER]: { start: "2026-05-09", venue: "lighter", lighterAccountIndex: "724608" }, // previously perp-pilot in factory/lighter.ts
  [CHAIN.ROBINHOOD]: { start: "2026-09-08", venue: "lighter", lighterAccountIndex: "23815" }, // Lighter on Robinhood Chain (dexs/lighter-rh)
  [CHAIN.INK]: { start: "2026-06-27", venue: "nado" },
  [CHAIN.ARC]: { start: "2026-10-22", venue: "extended" },
};

async function fetchNado(options: FetchOptions) {
  const logs = await options.getLogs({
    target: NADO_OFFCHAIN_EXCHANGE,
    eventAbi: "event BuilderFeePayment(bytes32 indexed subaccount, uint32 indexed builder, uint32 indexed productId, bytes32 digest, int128 builderFee, int128 fee, int128 quoteDelta)",
    topics: [null as any, null, "0x" + NADO_BUILDER_ID.toString(16).padStart(64, "0")],
  });

  let volume = 0;
  let fees = 0;
  for (const log of logs) {
    // x18 fixed point, quote is USDT0
    const quote = Number(log.quoteDelta) / 1e18;
    const builderFee = Math.abs(Number(log.builderFee)) / 1e18;
    const nadoFee = Math.abs(Number(log.fee)) / 1e18;
    // add both fees back to get the gross trade value: a sell (positive quote) received gross minus fees, a buy
    // (negative quote) paid gross plus fees
    volume += quote >= 0 ? quote + builderFee + nadoFee : -quote - builderFee - nadoFee;
    fees += builderFee;
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  dailyVolume.addUSDValue(volume);
  dailyFees.addUSDValue(fees, NADO_BUILDER_FEES_LABEL);
  return { dailyVolume, dailyFees };
}

const fetch = async (options: FetchOptions) => {
  const { venue, lighterAccountIndex } = chainConfig[options.chain];

  if (venue === "extended") {
    // volume only: the dashboard's fees are Extended's own trading fees, not PerpPilot's builder fee
    const { dailyVolume } = await fetchBuilderData({ options, builderNames: [EXTENDED_BUILDER_NAME] });
    return { dailyVolume };
  }

  let dailyVolume, dailyFees;
  if (venue === "lighter") {
    ({ dailyVolume, dailyFees } = await fetchLighterPartnerStats(options, lighterAccountIndex!));
  } else if (venue === "nado") {
    ({ dailyVolume, dailyFees } = await fetchNado(options));
  } else {
    const data = await fetchBuilderCodeDataV2({ options, builderAddresses: [HL_BUILDER_ADDRESS], market: "perps" });
    dailyVolume = data.dailyVolume;
    dailyFees = options.createBalances();
    dailyFees.add(data.dailyFees, HL_BUILDER_FEES_LABEL);
  }
  // PerpPilot keeps every builder/partner fee
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

const adapter: SimpleAdapter = {
  version: 1, // the Hyperliquid indexer and the Extended dashboard serve daily builder summaries
  fetch,
  adapter: chainConfig,
  doublecounted: true, // the trades are already counted in the Hyperliquid, Lighter, Extended and Nado listings
  methodology: {
    Volume: "Value of the perpetual futures trades that PerpPilot's trading bots place for its users on Hyperliquid, Lighter (including Lighter on Robinhood Chain), Nado and Extended.",
    Fees: "Fees that PerpPilot users pay to PerpPilot on top of the exchange's own trading fee, on bot trades placed on Hyperliquid, Lighter and Nado. Excludes Extended, which does not publish PerpPilot's fee.",
    Revenue: "All fees that PerpPilot users pay to PerpPilot on bot trades placed on Hyperliquid, Lighter and Nado, kept in full by PerpPilot. Excludes Extended, which does not publish PerpPilot's fee.",
    ProtocolRevenue: "All fees that PerpPilot users pay to PerpPilot on bot trades placed on Hyperliquid, Lighter and Nado, received by PerpPilot. Excludes Extended, which does not publish PerpPilot's fee.",
  },
  breakdownMethodology: {
    Fees: {
      [HL_BUILDER_FEES_LABEL]: "Builder fee that PerpPilot users pay on top of Hyperliquid's trading fee, on perpetual trades placed by PerpPilot bots.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Partner fee that PerpPilot users pay on top of Lighter's trading fee, on perpetual trades placed by PerpPilot bots on Lighter and Lighter on Robinhood Chain.",
      [NADO_BUILDER_FEES_LABEL]: "Builder fee that PerpPilot users pay on top of Nado's trading fee, on perpetual trades placed by PerpPilot bots.",
    },
    Revenue: {
      [HL_BUILDER_FEES_LABEL]: "Builder fees on Hyperliquid trades placed by PerpPilot bots, kept in full by PerpPilot.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Partner fees on Lighter and Lighter on Robinhood Chain trades placed by PerpPilot bots, kept in full by PerpPilot.",
      [NADO_BUILDER_FEES_LABEL]: "Builder fees on Nado trades placed by PerpPilot bots, kept in full by PerpPilot.",
    },
    ProtocolRevenue: {
      [HL_BUILDER_FEES_LABEL]: "Builder fees on Hyperliquid trades placed by PerpPilot bots, paid to PerpPilot.",
      [LIGHTER_PARTNER_FEES_LABEL]: "Partner fees on Lighter and Lighter on Robinhood Chain trades placed by PerpPilot bots, paid to PerpPilot.",
      [NADO_BUILDER_FEES_LABEL]: "Builder fees on Nado trades placed by PerpPilot bots, paid to PerpPilot.",
    },
  },
};

export default adapter;
