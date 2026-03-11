import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

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

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const value = {fees: false,after: "", type: "DAY", from: 1673136000, to: dayTimestamp }
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume(), value)).entities.nodes;
  const totalVolume = historicalVolume
    .filter(volItem => volItem.timestamp <= dayTimestamp)
    .reduce((acc, { volumeUSD }) => acc + Number(volumeUSD), 0)
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.timestamp === dayTimestamp)?.volumeUSD

  return {
    // totalVolume: totalVolume,
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SORA]: {
      fetch: fetch,
      start: '2023-01-08'
    },
  },
};

export default adapter;
