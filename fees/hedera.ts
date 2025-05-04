import { request } from "graphql-request";
import type { FetchOptions } from "../adapters/types";
import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const graphqlEndpoint = "https://mainnet.hedera.api.hgraph.dev/v1/graphql";

const fetch = async (_:any, _1: any, options: FetchOptions) => {
  const { fromTimestamp, toTimestamp } = options;
  const startDate = new Date(fromTimestamp * 1000).toISOString();
  const endDate = new Date(toTimestamp * 1000).toISOString();

  const graphQuery = `
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
  dailyFees.addCGToken('hedera-hashgraph', finalDailyFee);

  return {
    dailyFees
  };
};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: '2019-09-14'
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
