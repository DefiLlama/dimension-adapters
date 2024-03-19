import {
  BreakdownAdapter,
  FetchResultVolume,
  ProtocolType,
} from "../../adapters/types";

import fetchURL from "../../utils/fetchURL";

const urlTotalStats =
  "https://api.mngo.cloud/data/v4/stats/protocol-total-volume-fees";
const urlDailyStats =
  "https://api.mngo.cloud/data/v4/stats/protocol-daily-volume-fees";

interface TotalStats {
  total_volume: number;
  total_fees: number;
  spot_volume: number;
  perp_volume: number;
  spot_fees: number;
  perp_fees: number;
}
interface DailyStats {
  total_volume_24h: number;
  total_fees_24h: number;
  spot_volume_24h: number;
  perp_volume_24h: number;
  spot_fees_24h: number;
  perp_fees_24h: number;
}

const fetchSpotVolume = async (
  timestamp: number,
): Promise<FetchResultVolume> => {
  const totalStats: TotalStats = (await fetchURL(urlTotalStats));
  const dailyStats: DailyStats = (await fetchURL(urlDailyStats));
  return {
    dailyVolume: dailyStats?.spot_volume_24h.toString(),
    totalVolume: totalStats?.spot_volume.toString(),
    timestamp: timestamp,
  };
};

const fetchPerpVolume = async (
  timestamp: number,
): Promise<FetchResultVolume> => {
  const totalStats: TotalStats = (await fetchURL(urlTotalStats));
  const dailyStats: DailyStats = (await fetchURL(urlDailyStats));
  return {
    dailyVolume: dailyStats?.perp_volume_24h.toString(),
    totalVolume: totalStats?.perp_volume.toString(),
    timestamp: timestamp,
  };
};

const adapter: BreakdownAdapter = {
  breakdown: {
    spot: {
      solana: {
        fetch: fetchSpotVolume,
        runAtCurrTime: true,
        customBackfill: undefined,
        start: 0,
      },
    },
    perp: {
      solana: {
        fetch: fetchPerpVolume,
        runAtCurrTime: true,
        customBackfill: undefined,
        start: 0,
      },
    },
  },
  protocolType: ProtocolType.PROTOCOL,
};

export default adapter;
