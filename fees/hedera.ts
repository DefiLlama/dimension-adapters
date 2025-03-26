import { gql, request } from "graphql-request";
import type { FetchOptions } from "../adapters/types";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const graphqlEndpoint = "https://mainnet.hedera.api.hgraph.dev/v1/graphql";

const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options;
  const endOfDay = startOfDay + 24 * 60 * 60;
  const startDate = new Date(startOfDay * 1000).toISOString();
  const endDate = new Date(endOfDay * 1000).toISOString();

  const graphQuery = gql`
    {
          all_metrics: ecosystem_metric(
            where: {
              name: {_eq: "network_fee"},
              period: {_eq: "hour"},
              start_date: {_gte: "${startDate}"},
              end_date: {_lte: "${endDate}"},
            }
            order_by: {end_date: asc}
          ) {
            start_date
            end_date
            total
          }
        }
    `;

  const graphRes = await request(graphqlEndpoint, graphQuery);

  const tokenAmount = graphRes.all_metrics.reduce((acc: number, curr: any) => acc + Number(curr.total), 0);
  const finalDailyFee = tokenAmount / 1e8;

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('hedera', finalDailyFee);

  return {
    dailyFees
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: '2019-09-14'
    },
  },
};

export default adapter;
