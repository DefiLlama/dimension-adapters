import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const CHARTS_URL = "https://api.nearblocks.io/v1/charts";

const fetch = async (options: FetchOptions) => {
  const apiResponse = await fetchURL(CHARTS_URL);
  const charts = apiResponse.charts;
  if (!charts?.length) throw new Error("Missing Nearblocks charts data");

  const todaysData = charts.find((item) => item.date === `${options.dateString}T00:00:00.000Z`);
  if (!todaysData) {
    throw new Error(`No Nearblocks charts data found for date ${options.dateString}`);
  }

  return {
    dailyActiveUsers: todaysData.active_accounts,
    dailyTransactionsCount: todaysData.txns,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  protocolType: ProtocolType.CHAIN,
  start: "2020-07-21",
};

export default adapter;