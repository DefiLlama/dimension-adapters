import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../../helpers/hyperliquid-v2";
import { fetchLighterPartnerStats, LIGHTER_PARTNER_FEES_LABEL } from "../../helpers/lighter";
import { httpGet } from "../../utils/fetchURL";

// PerpPilot (https://www.perppilot.app, https://x.com/PerpPilot_io): automated perp trading bots that place orders on
// Hyperliquid, Lighter, Lighter on Robinhood Chain, Extended and Nado with PerpPilot's builder/partner code attached.
// Each venue pays PerpPilot a builder fee on top of its own trading fees; PerpPilot pays nothing to the venues.
// Builder ids below were supplied by the PerpPilot team. Previously listed as perp-pilot in factory/lighter.ts (zkLighter only).
// Not tracked: GRVT (builder account 0xc5be...f708) and AFX (builder address 0xc5be...f708), both retired by PerpPilot
// on 2026-10-05 with no public per-builder history; Phemex, a centralized exchange without builder codes.

// Hyperliquid builder address, the same wallet owns the Lighter and GRVT/AFX builder accounts
const HL_BUILDER_ADDRESSES = ["0xc5be9a8d99f7b508fcf24f4c9dbf39e5f584f708"];
const HL_BUILDER_FEES_LABEL = "Hyperliquid Builder Code Fees";

// Extended builder "PerpPilot" (builder id 248806) on the public builder dashboard
// The dashboard only serves the last ~31 days and reports Extended's own trading fees, not the builder fee, so
// Extended is tracked for volume only.
const EXTENDED_BUILDERS_API = "https://api.starknet.extended.exchange/api/v1/info/builder/dashboard";
const EXTENDED_BUILDER_NAME = "PerpPilot";

// Nado (Ink) builder id 4300, builder fees are emitted on-chain per fill by the Nado offchain exchange contract
// https://explorer.inkonchain.com/address/0x8373C3Aa04153aBc0cfD28901c3c971a946994ab
const NADO_OFFCHAIN_EXCHANGE = "0x8373C3Aa04153aBc0cfD28901c3c971a946994ab";
const NADO_BUILDER_ID = 4300;
const NADO_BUILDER_FEES_LABEL = "Nado Builder Fees";

type Venue = "hyperliquid" | "lighter" | "extended" | "nado";
const chainConfig: Record<string, { start: string; venue: Venue; lighterAccountIndex?: string }> = {
  [CHAIN.HYPERLIQUID]: { start: "2026-05-03", venue: "hyperliquid" },
  [CHAIN.ZK_LIGHTER]: { start: "2026-05-09", venue: "lighter", lighterAccountIndex: "724608" },
  [CHAIN.ROBINHOOD]: { start: "2026-09-08", venue: "lighter", lighterAccountIndex: "23815" }, // Lighter on Robinhood Chain (dexs/lighter-rh)
  [CHAIN.STARKNET]: { start: "2026-10-16", venue: "extended" }, // earliest day the Extended dashboard still serves
  [CHAIN.INK]: { start: "2026-06-27", venue: "nado" },
};

async function fetchExtended(options: FetchOptions) {
  const { data } = await httpGet(EXTENDED_BUILDERS_API);
  if (!Array.isArray(data?.daily) || !data.daily.length) throw new Error(`Extended builder dashboard returned no daily rows`);
  const oldest = data.daily.reduce((min: string, row: any) => (row.date < min ? row.date : min), data.daily[0].date);
  // days that have rolled out of the dashboard cannot be read, so they are missing rather than zero
  if (options.dateString < oldest) throw new Error(`Extended builder dashboard no longer serves ${options.dateString} (oldest ${oldest})`);
  const row = data.daily.find((i: any) => i.builderName === EXTENDED_BUILDER_NAME && i.date === options.dateString);
  const dailyVolume = options.createBalances();
  if (row) dailyVolume.addUSDValue(Number(row.volume));
  return { dailyVolume };
}

async function fetchNado(options: FetchOptions) {
  const logs = await options.getLogs({
    target: NADO_OFFCHAIN_EXCHANGE,
    eventAbi: "event BuilderFeePayment(bytes32 indexed subaccount, uint32 indexed builder, uint32 indexed productId, bytes32 digest, int128 feeAmount, int128 feeRate, int128 quoteAmount)",
    topics: [null as any, null, "0x" + NADO_BUILDER_ID.toString(16).padStart(64, "0")],
  });
  let volume = 0;
  let fees = 0;
  for (const log of logs) {
    // x18 fixed point, quote is USDT0
    volume += Math.abs(Number(log.quoteAmount)) / 1e18;
    fees += Math.abs(Number(log.feeAmount)) / 1e18;
  }
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  dailyVolume.addUSDValue(volume);
  dailyFees.addUSDValue(fees, NADO_BUILDER_FEES_LABEL);
  return { dailyVolume, dailyFees };
}

const fetch = async (options: FetchOptions) => {
  const { venue, lighterAccountIndex } = chainConfig[options.chain];
  if (venue === "extended") return fetchExtended(options);

  let dailyVolume, dailyFees;
  if (venue === "lighter") {
    ({ dailyVolume, dailyFees } = await fetchLighterPartnerStats(options, lighterAccountIndex!));
  } else if (venue === "nado") {
    ({ dailyVolume, dailyFees } = await fetchNado(options));
  } else {
    const data = await fetchBuilderCodeDataV2({ options, builderAddresses: HL_BUILDER_ADDRESSES, market: "perps" });
    dailyVolume = data.dailyVolume;
    dailyFees = options.createBalances();
    dailyFees.add(data.dailyFees, HL_BUILDER_FEES_LABEL);
  }
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

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
