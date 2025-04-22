import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC, formatTimestampAsDate } from "../../utils/date";
import { FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { BigNumber } from "bignumber.js";

const SUBGRAPH_URL = "https://gateway.thegraph.com/api/subgraphs/id/29CLSreMwU72p85UPTrPw3sW9yT2RarVDxs2p8DkhnkH";

// Define the GraphQL query to fetch order data
const dailyVolumeQuery = gql`
  query DailyVolumes($dayID: String!) {
    dailyVolume(id: $dayID) {
      totalAmount
      timestamp
    }
  }
`;


const fetchVolume = async (options: FetchOptions): Promise<FetchResultVolume> => {

  const dayID = `${options.startOfDay}`;

  const result = await request(SUBGRAPH_URL, dailyVolumeQuery, {
    dayID
  }, {
    'Authorization': 'Bearer 6b2f6a976e45a2d6a3fd1b8ad85c9764',
  });

  return {
    dailyVolume: BigNumber(result.dailyVolume.totalAmount).div(1e18).toString(),
    timestamp: result.dailyVolume.timestamp,
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: 1713849600,
    },
  },
};

export default adapter;
