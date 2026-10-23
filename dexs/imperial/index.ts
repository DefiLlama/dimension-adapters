import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const API_URL = "https://api.imperial.trade/api/v1/stats/volume/range";

// Imperial's own perp book (on-chain underwriter "sunrise"). Earlier Imperial volume was routed
// to Jupiter, Phoenix and Flash Trade and is already counted on those venues' listings.
const VENUE = "sunrise";

const BUILDER_FEES = "Builder Fees To Integrators";

interface VolumeRangeResponse {
  startTs: number;
  endTs: number;
  venue: string | null;
  volumeUsd: string;
  liquidationVolumeUsd: string;
  tradeCount: number;
  platformFeesUsd: string;
  builderFeesUsd: string;
}

function parseUsd(value: string, field: string): number {
  const parsed = Number(value);
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Imperial volume API returned an invalid ${field}: ${value}`);
  }
  return parsed;
}

const fetch = async (options: FetchOptions) => {
  const response: VolumeRangeResponse = await fetchURL(
    `${API_URL}?startTs=${options.startTimestamp}&endTs=${options.endTimestamp}&venue=${VENUE}`
  );

  if (response.startTs !== options.startTimestamp || response.endTs !== options.endTimestamp || response.venue !== VENUE) {
    throw new Error("Imperial volume API returned a different window or venue than requested");
  }

  const platformFees = parseUsd(response.platformFeesUsd, "platformFeesUsd");
  const builderFees = parseUsd(response.builderFeesUsd, "builderFeesUsd");

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const volume = parseUsd(response.volumeUsd, "volumeUsd");
  const liquidationVolume = parseUsd(response.liquidationVolumeUsd, "liquidationVolumeUsd");
  if (liquidationVolume > volume) {
    throw new Error("Imperial volume API returned more liquidation volume than total volume");
  }

  dailyVolume.addUSDValue(volume - liquidationVolume);
  dailyFees.addUSDValue(platformFees, METRIC.TRADING_FEES);
  dailyFees.addUSDValue(builderFees, BUILDER_FEES);
  dailyRevenue.addUSDValue(platformFees, METRIC.TRADING_FEES);
  dailySupplySideRevenue.addUSDValue(builderFees, BUILDER_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-16",
  methodology: {
    Volume:
      "Notional size of every trader fill on Imperial's perp markets (opens, increases and closes; liquidation fills are excluded), indexed from Imperial's Solana program and served by the Imperial stats API. Each fill counts once.",
    Fees: "Imperial's 1 bps trading fee on every open and close, plus any builder fee an integrator adds to orders it submits.",
    Revenue: "Imperial's 1 bps trading fee.",
    ProtocolRevenue: "Imperial's 1 bps trading fee, all kept by the protocol treasury.",
    SupplySideRevenue: "Builder fees paid to the integrators that submitted the orders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Imperial's 1 bps fee charged on the notional of each open and close.",
      [BUILDER_FEES]: "Optional builder fee set by an integrator on orders it submits, capped at 10 bps of notional.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Imperial's 1 bps trading fee.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "Imperial's 1 bps trading fee.",
    },
    SupplySideRevenue: {
      [BUILDER_FEES]: "Builder fees paid out to integrators.",
    },
  },
};

export default adapter;
