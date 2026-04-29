import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { formatUnits } from "ethers";

const endpoint = "https://graph.perpex.ai/celo-beta-usdt-wrap/subgraphs";

const fetchVolume = async (timestamp: number) => {
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

  const response = await request(endpoint, query, { timestamp });

  let dailyVolumeRaw = BigInt(0);
  if (response.positionVolumeInfos && response.positionVolumeInfos.length > 0) {
    response.positionVolumeInfos.forEach((entry: any) => {
      dailyVolumeRaw += BigInt(entry.volumeUsd || "0");
    });
  }

  const dailyVolume = formatUnits(dailyVolumeRaw, 30);

  return {
    timestamp: timestamp,
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CELO]: {
      fetch: fetchVolume,
      start: 1769588096,
    },
  },
};

export default adapter;
