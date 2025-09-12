import { httpGet } from "../../utils/fetchURL";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";

interface IVolumeResponse {
  total_volume_usd: number;
}

interface IOpenInterestResponse {
  total_open_interest: number;
}

const DERIVATIVE_URL = `https://bigquery-api-636134865280.europe-west1.run.app/injective_derivative_volume`;
const SPOT_URL = `https://bigquery-api-636134865280.europe-west1.run.app/injective_spot_volume`;
const OPEN_INTEREST_URL = `https://bigquery-api-636134865280.europe-west1.run.app/open_interest`;

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dateStr = new Date(timestamp * 1000).toISOString().split("T")[0];

  const derivativeRes: IVolumeResponse = await httpGet(
    `${DERIVATIVE_URL}?start_date=${dateStr}`
  );
  const spotRes: IVolumeResponse = await httpGet(
    `${SPOT_URL}?start_date=${dateStr}`
  );
  const openInterestRes: IOpenInterestResponse = await httpGet(
    `${OPEN_INTEREST_URL}?start_date=${dateStr}`
  );

  const derivativeVolume = derivativeRes.total_volume_usd || 0;
  const spotVolume = spotRes.total_volume_usd || 0;
  const dailyVolume = derivativeVolume + spotVolume;
  const openInterestAtEnd = openInterestRes.total_open_interest || 0;

  return {
    dailyVolume,
    openInterestAtEnd,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    injective: {
      runAtCurrTime: true,
      fetch,
      start: "2021-07-17",
    },
  },
};

export default adapter;
