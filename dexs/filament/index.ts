import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const assets = ["BTC", "ETH", "SOL", "TRUMP"];

const fetchForAsset = async (asset: string) => {
  const api = `https://orderbookv5.filament.finance/k8s/api/v1/orderbook/tradeVolumeStats/${asset}`;
  const timestamp = getUniqStartOfTodayTimestamp();
  const res = await httpGet(api);

  if (!res || typeof res !== "object" || !("allTimeVolume" in res) || !("volumeIn24Hours" in res)) {
    throw new Error(`Invalid response for asset ${asset}: ${JSON.stringify(res)}`);
  }

  const { allTimeVolume, volumeIn24Hours } = res;

  if (typeof allTimeVolume !== "number" || typeof volumeIn24Hours !== "number") {
    throw new Error(`Invalid volume data for ${asset}: ${JSON.stringify(res)}`);
  }

  return {
    timestamp,
    dailyVolume: volumeIn24Hours,
    totalVolume: allTimeVolume,
  };
};

const fetch = async () => {
  const results = await Promise.all(
    assets.map(async (asset) => {
      try {
        return { asset, ...(await fetchForAsset(asset)) };
      } catch (error) {
        console.error(`Error fetching ${asset}:`, error);
        return null;
      }
    })
  );

  return results.reduce((acc, item) => {
    if (item) {
      const { asset, ...data } = item;
      acc[asset] = data;
    }
    return acc;
  }, {} as Record<string, { timestamp: number; dailyVolume: number; totalVolume: number }>);
};

const adapter: SimpleAdapter = {
  adapter: {
    sei: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
