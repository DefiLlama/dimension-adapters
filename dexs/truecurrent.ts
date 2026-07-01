import { httpGet } from "../utils/fetchURL";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DERIVATIVE_URL = `https://bigquery-api-636134865280.europe-west1.run.app/truecurrent_derivative_volume`;

const fetch = async (options: FetchOptions) => {
  const derivativeRes: any = await httpGet(`${DERIVATIVE_URL}?start_date=${options.dateString}`);
  if (derivativeRes.days.length !== 1) throw new Error("No data found for the given date: " + options.dateString);

  return { dailyVolume: derivativeRes.total_volume_usd };
};

const methodology = {
  Volume: "Notional volume of all trades on Truecurrent interface (built on Injective DEX)",
}

export default {
  doublecounted: true, //injective perps
  fetch,
  start: "2026-05-15",
  chains: [CHAIN.INJECTIVE],
  methodology,
};
