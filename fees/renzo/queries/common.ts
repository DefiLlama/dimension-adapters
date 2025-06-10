import { GraphQLClient } from "graphql-request";
import { EZETH_HISTORICAL_DATA_SUBGRAPH_URL } from "../constants";

export const ETH_TOKEN_ID = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const client = new GraphQLClient(EZETH_HISTORICAL_DATA_SUBGRAPH_URL);

export const secondsToTheGraphTimestamp = (seconds: number) => {
  const ms = seconds * 1000;
  const theGraphTimestamp = ms * 1000;
  return String(theGraphTimestamp);
}
