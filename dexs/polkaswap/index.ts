import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const getDailyVolume = () => {
  return gql`
    query NetworkVolumeQuery($after: Cursor, $fees: Boolean!, $type: SnapshotType, $from: Int, $to: Int) {
        entities: networkSnapshots(after: $after, orderBy: TIMESTAMP_DESC, filter: {and: [{type: {equalTo: $type}}, {timestamp: {lessThanOrEqualTo: $to}}, {timestamp: {greaterThanOrEqualTo: $from}}]}) {
        nodes {
          timestamp
          volumeUSD @skip(if: $fees)
          fees @include(if: $fees)
        }
      }
  }`
}

const graphQLClient = new GraphQLClient("https://api.subquery.network/sq/sora-xor/sora-prod");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  timestamp: number;
  volumeUSD: string;
}

const fetch = async (options: FetchOptions) => {
  const value = {fees: false,after: "", type: "DAY", from: 1673136000, to: options.startOfDay }
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume(), value)).entities.nodes;
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.timestamp === options.startOfDay)?.volumeUSD

  return {
    dailyVolume: dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SORA],
  start: '2023-01-08',
};

export default adapter;
