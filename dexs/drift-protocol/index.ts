import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { queryDune } from "../../helpers/dune";
import { BreakdownAdapter, FetchOptions } from "../../adapters/types";

const DAILY_VOL_ENDPOINT =
  "https://mainnet-beta.api.drift.trade/stats/24HourVolume";

// const DUNE_QUERY_ID = "3756979"; // https://dune.com/queries/3756979/6318568
const DUNE_QUERY_ID = "4057938"; // Should be faster than the above - https://dune.com/queries/3782153/6359334

type DimentionResult = {
  dailyVolume?: number;
  dailyFees?: number;
  dailyUserFees?: number;
  dailyRevenue?: number;
};


async function getPerpDimensions(options: FetchOptions): Promise<DimentionResult> {
  const dayInSec = 24 * 60 * 60;
  const resultRows = await queryDune(DUNE_QUERY_ID, {
    start: options.startOfDay,
    end: options.startOfDay + dayInSec,
  });

  const { perpetual_volume, total_revenue, total_taker_fee } = resultRows[0];

  return {
    dailyVolume: perpetual_volume,
    dailyFees: total_taker_fee,
    dailyUserFees: total_taker_fee,
    dailyRevenue: total_revenue,
  };
}

async function getSpotDimensions(): Promise<DimentionResult> {
  const volumeResponse = await httpGet(
    `${DAILY_VOL_ENDPOINT}?spotMarkets=true`
  );

  const rawVolumeQuotePrecision = volumeResponse.data.volume;

  // Volume will be returned in 10^6 precision
  const dailyVolume =
    rawVolumeQuotePrecision.length >= 6
      ? Number(rawVolumeQuotePrecision.slice(0, -6))
      : 0;

  return { dailyVolume };
}

async function fetch(type: "perp" | "spot", options: FetchOptions) {
  const timestamp = Date.now() / 1e3;

  if (type === "perp") {
    const results = await getPerpDimensions(options);

    return {
      ...results,
      timestamp,
    };
  } else {
    const results = await getSpotDimensions();

    return {
      ...results,
      timestamp: Date.now() / 1e3,
    };
  }
}

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetch("spot", options),
        start: 1690239600,
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetch("perp", options),
        start: 1690239600,
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
