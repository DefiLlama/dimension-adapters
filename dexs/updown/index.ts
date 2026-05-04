import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { formatUnits } from "ethers";

const endpoint = "https://graph.perpex.ai/celo-beta-usdt-wrap/subgraphs";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = gql`
    query MyQuery {
      positionVolumeInfos(
        where: { period: "1d" }
        orderBy: timestamp
        orderDirection: desc
      ) {
        timestamp
        volumeUsd
      }
    }
  `;

    const response = await request(endpoint, query);
    const todaysData = response.positionVolumeInfos.filter((entry: any) => entry.timestamp === options.startOfDay);

    if (!todaysData || todaysData.length === 0) {
        throw new Error(`No data found for ${options.dateString}`);
    }

    let dailyVolume = 0
    for (const data of todaysData) {
        dailyVolume += Number(formatUnits(data.volumeUsd, 30));
    }

    return {
        dailyVolume,
    };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.CELO],
    start: '2026-01-04',
};

export default adapter;
