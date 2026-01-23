import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

const ENVIO_GRAPHQL_URL = "https://kby-hasura.up.railway.app/v1/graphql";

const query = gql`
  query DailyStats($startDate: Int!, $endDate: Int!) {
    UniswapDayData(
      where: { chainId: { _eq: 4326 }, date: { _gte: $startDate, _lt: $endDate } }
      order_by: { date: desc }
      limit: 1
    ) {
      date
      volumeUSD
      feesUSD
      tvlUSD
    }
  }
`;

const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options;
  const startDate = startOfDay;
  const endDate = startOfDay + 86400;

  const data = await request(ENVIO_GRAPHQL_URL, query, { startDate, endDate });
  const dayData = data.UniswapDayData?.[0];

  const dailyVolume = dayData?.volumeUSD ? parseFloat(dayData.volumeUSD) : 0;
  const dailyFees = dayData?.feesUSD ? parseFloat(dayData.feesUSD) : 0;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees * 0.5, // 50% protocol fee when enabled
    dailySupplySideRevenue: dailyFees * 0.5, // 50% to LPs
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: "2025-12-21",
    },
  },
};

export default adapter;
