import { httpGet } from "../utils/fetchURL";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const OPEN_INTEREST_URL = `https://bigquery-api-636134865280.europe-west1.run.app/open_interest`;

const fetch = async (_: number, _t: any, options: FetchOptions) => {
  const openInterestRes: any = await httpGet(
    `${OPEN_INTEREST_URL}?start_date=${options.dateString}`,
  );
  if (openInterestRes.days.length !== 1)
    throw new Error(
      "No OI data found for the given date: " + options.dateString,
    );

  return {
    openInterestAtEnd: openInterestRes.total_open_interest,
  };
};

export default {
  fetch,
  start: "2021-07-17",
  chains: [CHAIN.INJECTIVE],
};
