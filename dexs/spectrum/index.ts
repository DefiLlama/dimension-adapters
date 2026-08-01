import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface IResponse {
  volume: number;
}

interface IResponseERGO {
  volume: {
    value: number;
  }
}

const fetchVolumeADA = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const response: IResponse = (await fetchURL(`https://analytics-balanced.spectrum.fi/cardano/platform/stats`));
  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("cardano", Number(response.volume));

  return { dailyVolume };
}

const fetchVolumeERGO = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const from = options.toTimestamp - 24 * 60 * 60 * 1000;
  const response: IResponseERGO = (await fetchURL(`https://api.spectrum.fi/v1/amm/platform/stats?from=${from}`));
  const dailyVolume = Number(response.volume.value);
  return { dailyVolume };
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
