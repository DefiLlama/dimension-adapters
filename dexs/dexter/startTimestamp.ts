const {GraphQLClient, gql} = require('graphql-request');
import {dexterSubgraphEndpoint} from "./constants";

const operation = gql`
    query defillama_dex_startTimestamp {
        start: pool_daily_closing_data(
            order_by: {date: asc}
            limit: 1
        ) {
            date
        }
    }
`;

interface OperationResponse {
  start: Array<{
    date: string
  }>
}

export const getStartTimestamp = async () => {
  const graphQLClient = new GraphQLClient(dexterSubgraphEndpoint);
  const res = (await graphQLClient.request(operation)) as OperationResponse;
  let startDate = res.start[0].date; // "2023-03-26"

  let parts = startDate.split("-");
  return new Date(
    Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  ).getTime() / 1000;
}