import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const HISTORICAL_OPEN_INTEREST_ENDPOINT = "https://api.strikefinance.org/stat/v1/dashboard/open-interest";

const fetch = async (options: FetchOptions) => {
  const { open_interest }: { open_interest: [number, string, number | string][] } = await fetchURL(HISTORICAL_OPEN_INTEREST_ENDPOINT);
  const startTimestamp = options.startTimestamp * 1000;
  const targetTimestamp = options.endTimestamp * 1000;
  const timestamps = open_interest
    .map(([timestamp]) => Number(timestamp))
    .filter((timestamp) => timestamp >= startTimestamp && timestamp <= targetTimestamp);

  if (!timestamps.length) throw new Error(`No Strike Finance open interest data found for ${options.dateString}`);

  const endOfPeriodTimestamp = Math.max(...timestamps);
  const openInterestAtEnd = open_interest
    .filter(([timestamp]) => Number(timestamp) === endOfPeriodTimestamp)
    .reduce((sum, [, , openInterest]) => sum + Number(openInterest), 0);

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  start: "2026-03-19",
};

export default adapter;
