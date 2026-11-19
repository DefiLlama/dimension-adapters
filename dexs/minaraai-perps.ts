import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import fetchURL from "../utils/fetchURL";

const LIGHTER_API_BASE_URL = "https://mainnet.zklighter.elliot.ai/api/v1/partnerStats";
// Minara Hyperliquid builder code. Source: HyperTracker / factory listing
const HL_BUILDER_ADDRESS = "0x5a3bc60b0a99a7f4fbf0d15554fa5fe88e7628c2";
// Minara Lighter partner/builder account index
const LIGHTER_ACCOUNT_INDEX = 724927;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (options.chain === CHAIN.HYPERLIQUID) {
    const hyperliquidResponse = await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });

    dailyVolume.add(hyperliquidResponse.dailyVolume);
    dailyFees.add(hyperliquidResponse.dailyFees, "Hyperliquid Builder Code Fees");
    dailyRevenue.add(hyperliquidResponse.dailyRevenue, "Hyperliquid Builder Code Fees");
    dailyProtocolRevenue.add(hyperliquidResponse.dailyProtocolRevenue, "Hyperliquid Builder Code Fees");
  } else if (options.chain === CHAIN.ZK_LIGHTER) {
    const lighterResponse = await fetchURL(
      `${LIGHTER_API_BASE_URL}?account_index=${LIGHTER_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`
    );

    dailyVolume.addUSDValue(Number(lighterResponse.total_volume));
    dailyFees.addUSDValue(Number(lighterResponse.total_fees_earned), "Lighter Partner Fees");
    dailyRevenue.addUSDValue(Number(lighterResponse.total_fees_earned), "Lighter Partner Fees");
    dailyProtocolRevenue.addUSDValue(Number(lighterResponse.total_fees_earned), "Lighter Partner Fees");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume: "Taker notional volume of perpetual trades routed through Minara on Hyperliquid and Lighter.",
  Fees: "Builder code fees from Hyperliquid perps trades and partner fees from Lighter perps trades routed through Minara.",
  Revenue: "Builder code fees from Hyperliquid perps trades and partner fees from Lighter perps trades routed through Minara.",
  ProtocolRevenue: "Builder code fees from Hyperliquid perps trades and partner fees from Lighter perps trades routed through Minara.",
};

const breakdownMethodology = {
  Fees: {
    "Hyperliquid Builder Code Fees": "Builder code fees paid by users on Hyperliquid perpetual trades executed through Minara.",
    "Lighter Partner Fees": "Partner fees earned by Minara through its Lighter perps integration.",
  },
  Revenue: {
    "Hyperliquid Builder Code Fees": "Builder code fees collected by Minara from Hyperliquid perpetual trades.",
    "Lighter Partner Fees": "Partner fees earned by Minara through its Lighter perps integration.",
  },
  ProtocolRevenue: {
    "Hyperliquid Builder Code Fees": "Builder code fees collected by Minara from Hyperliquid perpetual trades.",
    "Lighter Partner Fees": "Partner fees earned by Minara through its Lighter perps integration.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      start: "2025-12-22",
    },
    [CHAIN.ZK_LIGHTER]: {
      start: "2026-05-22",
    },
  },
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
