import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import fetchURL from "../../utils/fetchURL";

const HL_BUILDER_ADDRESS = "0xf5b79dea3d8cf3efa95e8176ebd885634d869f51";
const LIGHTER_PARTNER_STATS_URL = "https://mainnet.zklighter.elliot.ai/api/v1/partnerStats";
// Taco's Lighter integrator account, fees from routed client trades accrue here.
const LIGHTER_ACCOUNT_INDEX = 736513;
// Taco moved its underlying venue from Hyperliquid to Lighter on 2026-08-05,
// so 2026-08-04 is the last day the Hyperliquid builder code is tracked.
const HL_END_DATE = "2026-08-04";
const LIGHTER_START_DATE = "2026-08-05";

const fetchHyperliquid = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });

  const fees = options.createBalances();
  const revenue = options.createBalances();
  const protocolRevenue = options.createBalances();
  fees.addBalances(dailyFees, "Hyperliquid Builder Code Fees");
  revenue.addBalances(dailyRevenue, "Hyperliquid Builder Code Fees");
  protocolRevenue.addBalances(dailyProtocolRevenue, "Hyperliquid Builder Code Fees");

  return { dailyVolume, dailyFees: fees, dailyRevenue: revenue, dailyProtocolRevenue: protocolRevenue };
};

const fetchLighter = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const response = await fetchURL(
    `${LIGHTER_PARTNER_STATS_URL}?account_index=${LIGHTER_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`
  );

  dailyVolume.addUSDValue(Number(response.total_volume));
  dailyFees.addUSDValue(Number(response.total_fees_earned), "Lighter Partner Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "Perps volume routed through Taco: Hyperliquid builder code volume until 2026-08-05, Lighter partner attribution volume after.",
  Fees: "Builder code revenue from Hyperliquid perps trades, and partner fees from Taco's Lighter perps integration.",
  Revenue: "Builder code revenue from Hyperliquid perps trades, and partner fees from Taco's Lighter perps integration.",
  ProtocolRevenue: "Builder code revenue from Hyperliquid perps trades, and partner fees from Taco's Lighter perps integration.",
};

const breakdownMethodology = {
  Fees: {
    "Hyperliquid Builder Code Fees": "Builder code revenue from Hyperliquid perps trades (until 2026-08-05).",
    "Lighter Partner Fees": "Partner fees earned by Taco through its Lighter perps integration.",
  },
  Revenue: {
    "Hyperliquid Builder Code Fees": "Builder code revenue from Hyperliquid perps trades (until 2026-08-05).",
    "Lighter Partner Fees": "Partner fees earned by Taco through its Lighter perps integration.",
  },
  ProtocolRevenue: {
    "Hyperliquid Builder Code Fees": "Builder code revenue from Hyperliquid perps trades (until 2026-08-05).",
    "Lighter Partner Fees": "Partner fees earned by Taco through its Lighter perps integration.",
  },
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-11-19",
      deadFrom: HL_END_DATE,
    },
    [CHAIN.ZK_LIGHTER]: {
      fetch: fetchLighter,
      start: LIGHTER_START_DATE,
    },
  },
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
