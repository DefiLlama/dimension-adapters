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

const fetch = async (_timestamp: number, _block: any, options: FetchOptions) => {
  const chain = CHAIN.ZKSYNC;
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000));

  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
    id: `1d:${dayTimestamp}`,
    period: "1d",
  });

  const totalData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
    id: "total",
    period: "total",
  });

  let dailyVolume = 0;

  if (dailyData.volumeInfos.length === 1) {
    const volumeObj = dailyData.volumeInfos[0];
    const sumOfFields = Object.values(volumeObj).reduce((sum, val) => sum + Number(val), 0);
    dailyVolume = sumOfFields * 1e-30;
  }

  if (totalData.volumeInfos.length === 1) {
    const volumeObj = totalData.volumeInfos[0];
    const sumOfFields = Object.values(volumeObj).reduce((sum, val) => sum + Number(val), 0);
  }

  return {
    timestamp: dayTimestamp,
    dailyVolume: String(dailyVolume),
  };
};

const methodology = {
  dailyVolume: "Sum of daily swap or margin volume for RFX subgraph.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ZKSYNC]: {
      fetch,
      start: 1733356800,
    },
  },
  methodology,
};

export default adapter;
