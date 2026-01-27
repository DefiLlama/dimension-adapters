import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://staging-ammv3-indexer.oraidex.io/";
const fetch = async (_timestamp: number, _t: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000));
  const dayIndex = Math.floor(dayTimestamp / 86400);
  const query = gql`
      query PoolDayData {
        poolDayData(
            filter: {
                dayIndex: { equalTo: ${dayIndex} }
            }
        ) {
            aggregates {
                sum {
                    volumeInUSD
                }
            }
        }
      }`;

  const res = await new GraphQLClient(historicalVolumeEndpoint).request(query);
  const dailyVolume = res.poolDayData.aggregates.sum.volumeInUSD;
  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ORAI]: {
      fetch,
      start: '2024-08-02',
    },
  },
};

export default adapter;
