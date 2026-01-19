import { httpGet } from "../utils/fetchURL";
import { FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SPOT_URL = `https://bigquery-api-636134865280.europe-west1.run.app/injective_spot_volume`;

const fetch = async (_: number, _t: any, options: FetchOptions) => {
  const spotRes: any = await httpGet(`${SPOT_URL}?start_date=${options.dateString}`);
  
  if (!spotRes?.days?.length) {
    return {
      dailyVolume: "0",
    };
  }

  return { dailyVolume: spotRes.total_volume_usd, };
};

export default {
  fetch,
  start: "2021-07-17",
  chains: [CHAIN.INJECTIVE]
};
