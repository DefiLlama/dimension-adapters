import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";

const BASE_URL = "https://app.azverse.xyz/exapi/stats/v1/stats/public/defillama";

export type AzverseMarket = "perp" | "spot";

type DailyStatsBucket = {
  volume: number;
  fees: number;
  revenue: number;
};

type DailyStatsResponse = {
  code?: number;
  msg?: string;
  data?: {
    date?: string;
    perp?: DailyStatsBucket;
    spot?: DailyStatsBucket;
  };
};

export type AzverseDailyStats = {
  volume: number;
  fees: number;
  builderRevenue: number;
  protocolRevenue: number;
};

/**
 * The AZverse API exposes immutable UTC-day aggregates only. `revenue` is the
 * builder fee share, so it is a supply-side cost rather than protocol revenue.
 */
export async function getAzverseDailyStats(date: string, market: AzverseMarket, brokerId?: string): Promise<AzverseDailyStats> {
  const query = new URLSearchParams({ date });
  if (brokerId) query.set("broker_id", brokerId);

  const response: DailyStatsResponse = await httpGet(`${BASE_URL}/daily-stats?${query}`);
  if (response?.code !== 200) throw new Error(`AZverse daily stats unavailable for ${date}: ${response?.msg ?? "unknown error"}`);
  if (response.data?.date !== date) throw new Error(`AZverse daily stats returned a mismatched date: expected ${date}, got ${response.data?.date}`);

  const bucket = response.data[market];
  if (!bucket) throw new Error(`AZverse daily stats missing ${market} data for ${date}`);

  const volume = Number(bucket.volume);
  const fees = Number(bucket.fees);
  const builderRevenue = Number(bucket.revenue);
  if (![volume, fees, builderRevenue].every(Number.isFinite) || volume < 0 || fees < 0 || builderRevenue < 0) {
    throw new Error(`AZverse daily stats contain invalid ${market} values for ${date}`);
  }
  if (builderRevenue > fees) throw new Error(`AZverse builder revenue exceeds fees for ${market} on ${date}`);

  return { volume, fees, builderRevenue, protocolRevenue: fees - builderRevenue };
}

type AzverseBrokerConfig = {
  brokerId: string;
  brokerName: string;
  start: string;
};

export function azverseBrokerVolumeExports({ brokerId, brokerName, start }: AzverseBrokerConfig): SimpleAdapter {
  const fetch = async (options: FetchOptions) => {
    const { volume } = await getAzverseDailyStats(options.dateString, "perp", brokerId);

    return { dailyVolume: volume / 2 }; // api counts both sides of the trade for broker
  };

  return {
    version: 1,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start,
    doublecounted: true,
    methodology: {
      Volume: `USD notional volume of perpetual trades routed through ${brokerName} on AZverse.`,
    },
  };
}

export function azverseBrokerFeesExports({ brokerId, brokerName, start }: AzverseBrokerConfig): SimpleAdapter {
  const fetch = async (options: FetchOptions) => {
    const { fees, builderRevenue, protocolRevenue } = await getAzverseDailyStats(options.dateString, "perp", brokerId);
    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(fees, "Perpetual Trading Fees");
    dailyUserFees.addUSDValue(fees, "Perpetual Trading Fees");
    dailyRevenue.addUSDValue(builderRevenue, "Builder Revenue Share");
    dailyProtocolRevenue.addUSDValue(builderRevenue, "Builder Revenue Share");
    dailySupplySideRevenue.addUSDValue(protocolRevenue, "AZverse Fee Share");

    return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
  };

  const methodology = {
    Fees: `All perpetual trading fees paid by users routed through ${brokerName} on AZverse.`,
    UserFees: `All perpetual trading fees are paid directly by users trading through ${brokerName}.`,
    Revenue: `The builder fee share retained by ${brokerName}.`,
    ProtocolRevenue: `The builder fee share retained by ${brokerName}.`,
    SupplySideRevenue: "The share of routed trading fees retained by AZverse.",
  };

  return {
    version: 1,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start,
    doublecounted: true,
    methodology,
    breakdownMethodology: {
      Fees: { "Perpetual Trading Fees": methodology.Fees },
      UserFees: { "Perpetual Trading Fees": methodology.UserFees },
      Revenue: { "Builder Revenue Share": methodology.Revenue },
      ProtocolRevenue: { "Builder Revenue Share": methodology.ProtocolRevenue },
      SupplySideRevenue: { "AZverse Fee Share": methodology.SupplySideRevenue },
    },
  };
}
