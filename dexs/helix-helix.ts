import { httpGet } from "../utils/fetchURL";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SPOT_URL = `https://bigquery-api-636134865280.europe-west1.run.app/helix_spot_volume`;

const fetch = async (_: number, _t: any, options: FetchOptions) => {
  const spotRes: any = await httpGet(`${SPOT_URL}?start_date=${options.dateString}`);
  if (spotRes.days.length !== 1) throw new Error("No data found for the given date: " + options.dateString);

  return { dailyVolume: spotRes.total_volume_usd };
};

export default {
  doublecounted: true,
  fetch,
  start: "2022-09-06",
  chains: [CHAIN.INJECTIVE],
};
