import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";

interface IResponse {
  volume: number;
}

interface IResponseERGO {
  volume: {
    value: number;
  }
}

const fetchVolumeADA = async (timestamp: number): Promise<FetchResultVolume> => {
  const response: IResponse = (await fetchURL(`https://analytics-balanced.spectrum.fi/cardano/platform/stats`));
  const coinId = "coingecko:cardano";
  const prices = await getPrices([coinId], timestamp)
  const adaPrice = prices[coinId].price;
  const dailyVolume = Number(response.volume) * adaPrice;

  return {
    dailyVolume: dailyVolume,
    timestamp
  };
}

const fetchVolumeERGO = async (timestamp: number): Promise<FetchResultVolume> => {
  const from = timestamp - 24 * 60 * 60 * 1000;
  const response: IResponseERGO = (await fetchURL(`https://api.spectrum.fi/v1/amm/platform/stats?from=${from}`));
  const dailyVolume = Number(response.volume.value);
  return {
    dailyVolume: dailyVolume,
    timestamp
  };
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.CARDANO]: {
      fetch: fetchVolumeADA,
      start: '2023-10-12',
      runAtCurrTime: true,
    },
    [CHAIN.ERGO]: {
      fetch: fetchVolumeERGO,
      start: '2023-10-12',
      runAtCurrTime: true,
    }
  }
}
export default adapters;
