import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_URL = "https://api.zofinance.io/analytics/open-interest";

const fetch = async (options: FetchOptions) => {
  const { data } = await fetchURL(`${API_URL}?range=1y`);
  const timestamp = data.reduce((latest: string, row: any) => (
    new Date(row.timestamp).getTime() / 1000 <= options.endTimestamp && row.timestamp > latest ? row.timestamp : latest
  ), "");
  const rows = data.filter((row: any) => row.timestamp === timestamp);

  let openInterestAtEnd = 0;
  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;

  for (const row of rows) {
    openInterestAtEnd += Number(row.totalOpenInterest);
    longOpenInterestAtEnd += Number(row.longOpenInterest);
    shortOpenInterestAtEnd += Number(row.shortOpenInterest);
  }

  return {
    openInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  start: "2025-09-19",
  runAtCurrTime: true,
};

export default adapter;
