import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const assets = ["BTC", "ETH", "SOL", "TRUMP"];

const fetchForAsset = async (asset: string) => {
  const api = `https://orderbookv5.filament.finance/k8s/api/v1/orderbook/tradeVolumeStats/${asset}`;
  const timestamp = getUniqStartOfTodayTimestamp();
  const res = await httpGet(api);
  const { allTimeVolume, volumeIn24Hours } = res;

  return {
    timestamp,
    dailyVolume: volumeIn24Hours,
    totalVolume: allTimeVolume,
  };
};

const fetch = async () => {
  const results = await Promise.all(
    assets.map(async (asset) => ({
      asset,
      ...(await fetchForAsset(asset)),
    }))
  );

  return results.reduce((acc, { asset, ...data }) => {
    acc[asset] = data;
    return acc;
  }, {} as Record<string, { timestamp: number; dailyVolume: number; totalVolume: number }>);
};

const adapter: SimpleAdapter = {
  adapter: {
    sei: {
      fetch,
      start: 126044642,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
