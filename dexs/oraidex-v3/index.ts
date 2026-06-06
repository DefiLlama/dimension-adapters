import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://staging-ammv3-indexer.oraidex.io/";
const fetch = async (options: FetchOptions) => {
  const dayIndex = Math.floor(options.startOfDay / 86400);
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
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ORAI],
  start: '2024-08-02',
};

export default adapter;
