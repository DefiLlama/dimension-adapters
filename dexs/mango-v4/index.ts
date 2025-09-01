import {
  BreakdownAdapter,
  FetchResultVolume,
  ProtocolType,
} from "../../adapters/types";

import fetchURL from "../../utils/fetchURL";

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
  const dailyStats: DailyStats = (await fetchURL(urlDailyStats));
  return {
    dailyVolume: dailyStats?.spot_volume_24h.toString(),
    timestamp: timestamp,
  };
};

const fetchPerpVolume = async (
  timestamp: number,
): Promise<FetchResultVolume> => {
  const dailyStats: DailyStats = (await fetchURL(urlDailyStats));
  return {
    dailyVolume: dailyStats?.perp_volume_24h.toString(),
    timestamp: timestamp,
  };
};

const adapter: BreakdownAdapter = {
  breakdown: {
    spot: {
      solana: {
        fetch: fetchSpotVolume,
        runAtCurrTime: true,
              },
    },
    perp: {
      solana: {
        fetch: fetchPerpVolume,
        runAtCurrTime: true,
              },
    },
  },
  protocolType: ProtocolType.PROTOCOL,
  deadFrom: '2025-02-05',
};

export default adapter;
