import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const assets = ["BTC", "ETH", "SOL", "SEI"];

const fetchForAsset = async (asset: string) => {
  const api = `https://orderbookv5.filament.finance/k8s/api/v1/orderbook/tradeVolumeStats/${asset}`;
  const res = await httpGet(api);

  if (!res || typeof res !== "object" || !("allTimeVolume" in res) || !("volumeIn24Hours" in res)) {
    throw new Error(`Invalid response for asset ${asset}: ${JSON.stringify(res)}`);
  }

  const { allTimeVolume, volumeIn24Hours } = res;

  if (typeof allTimeVolume !== "number" || typeof volumeIn24Hours !== "number") {
    throw new Error(`Invalid volume data for ${asset}: ${JSON.stringify(res)}`);
  }

  return {
    dailyVolume: volumeIn24Hours,
    totalVolume: allTimeVolume,
  };
};

const fetch = async () => {
  const results = await Promise.all(
    assets.map(async (asset) => {
        return { asset, ...(await fetchForAsset(asset)) };
    })
  );
  return {
    dailyVolume: results.reduce((acc, item) => acc + item.dailyVolume, 0),
  }
};

const adapter: SimpleAdapter = {
  deadFrom: '2025-04-19',
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
