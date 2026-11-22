import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../helpers/hyperliquid-v2";
import { httpGet } from "../utils/fetchURL";

// verifiable in the builder field of Vesper orders and the public builder_fills archive
const HL_BUILDER_ADDRESS = "0x0ee49cd701e9575d683e409e23750a487e521053";

const LABELS = {
  HYPERLIQUID: "Hyperliquid Builder Code Fees",
  ONDO: "Ondo Perps Builder Code Fees",
};

async function fetchHyperliquid(options: FetchOptions) {
  const { dailyVolume, dailyFees: builderFees } = await fetchBuilderCodeDataV2({ options, builderAddresses: [HL_BUILDER_ADDRESS], market: "perps" });
  const dailyFees = options.createBalances();
  dailyFees.add(builderFees, LABELS.HYPERLIQUID);
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
}

// Vesper's daily copy of Ondo's /v1/builder_code/stats report for its builder code
async function fetchOndo(options: FetchOptions) {
  const { volumeUsd, builderFeesUsd } = await httpGet(`https://sypherscore.com/static/defillama/ondo/${options.dateString}.json`);
  if (volumeUsd === undefined || builderFeesUsd === undefined) throw new Error(`Missing Ondo builder totals for ${options.dateString}`);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(builderFeesUsd), LABELS.ONDO);
  return { dailyVolume: Number(volumeUsd), dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: { fetch: fetchHyperliquid, start: "2026-08-27" },
    [CHAIN.OFF_CHAIN]: { fetch: fetchOndo, start: "2026-11-14" },
  },
  doublecounted: true,
  methodology: {
    Volume: "Notional value of the perpetual trades the Vesper market-making bot places for its users on Hyperliquid (HIP-3 markets) and Ondo Perps, counting the fills each venue attributes to Vesper's builder code.",
    Fees: "Builder code fees users pay to Vesper on top of the venue's own fees for trades placed through Vesper on Hyperliquid and Ondo Perps; excludes Hyperliquid and Ondo trading fees and HIP-3 deployer fees.",
    Revenue: "All builder code fees from Vesper trades on Hyperliquid and Ondo Perps, kept by Vesper.",
    ProtocolRevenue: "All builder code fees from Vesper trades on Hyperliquid and Ondo Perps, received by Vesper.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.HYPERLIQUID]: "Builder code fees paid by users on Hyperliquid perpetual trades placed through Vesper.",
      [LABELS.ONDO]: "Builder code fees paid by users on Ondo Perps trades placed through Vesper, from Ondo's daily builder code report.",
    },
    Revenue: {
      [LABELS.HYPERLIQUID]: "Builder code fees from Hyperliquid perpetual trades, kept by Vesper.",
      [LABELS.ONDO]: "Builder code fees from Ondo Perps trades, kept by Vesper.",
    },
    ProtocolRevenue: {
      [LABELS.HYPERLIQUID]: "Builder code fees from Hyperliquid perpetual trades, received by Vesper.",
      [LABELS.ONDO]: "Builder code fees from Ondo Perps trades, received by Vesper.",
    },
  },
};

export default adapter;
