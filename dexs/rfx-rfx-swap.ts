import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoints: { [chain: string]: string } = {
  [CHAIN.ZKSYNC]: "https://api.studio.thegraph.com/query/62681/rfxs-master/version/latest",
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeInfos(where: {period: $period, id: $id}) {
      swapVolumeUsd
    }
  }
`;

interface IGraphResponse {
  volumeInfos: Array<{
    swapVolumeUsd?: string;
    marginVolumeUsd?: string;
  }>;
}

const fetch = async (options: FetchOptions) => {
  const chain = CHAIN.ZKSYNC;
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000));

  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
    id: `1d:${dayTimestamp}`,
    period: "1d",
  });

  let dailyVolume = 0;

  if (dailyData.volumeInfos.length === 1) {
    const volumeObj = dailyData.volumeInfos[0];
    const sumOfFields = Object.values(volumeObj).reduce((sum, val) => sum + Number(val), 0);
    dailyVolume = sumOfFields * 1e-30;
  }
  return { dailyVolume, timestamp: dayTimestamp }
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ZKSYNC],
  start: 1733356800,
  deadFrom: "2025-08-12",
};

export default adapter;
