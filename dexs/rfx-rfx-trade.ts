import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [chain: string]: string } = {
  [CHAIN.ZKSYNC]: "https://api.studio.thegraph.com/query/62681/rfxs-master/version/latest",
};

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeInfos(where: {period: $period, id: $id}) {
      marginVolumeUsd
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

  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataDerivatives, {
    id: `1d:${options.startOfDay}`,
    period: "1d",
  });

  let dailyVolume = 0;

  if (dailyData.volumeInfos.length === 1) {
    const volumeObj = dailyData.volumeInfos[0];
    const sumOfFields = Object.values(volumeObj).reduce((sum, val) => sum + Number(val), 0);
    dailyVolume = sumOfFields * 1e-30;
  }

  return { dailyVolume }
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ZKSYNC],
  start: 1733356800,
  deadFrom: "2025-08-12",
};

export default adapter;
