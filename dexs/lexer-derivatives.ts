import { SimpleAdapter, FetchResultVolume, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, request } from "graphql-request";

const apiEndPoints = [
  "https://api.studio.thegraph.com/query/50217/synth-stat-v2-arb-mainnet/version/latest",
  "https://api.studio.thegraph.com/query/50217/core-stat-v2-arb-mainnet/version/latest",
];

interface VolumeStatsQuery {
  swap: string;
  mint: string;
  burn: string;
  liquidation: string;
  margin: string;
}

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
    }
  }
`;

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  let dailyVolume = 0;
  const results = await Promise.all(
    apiEndPoints.map((api) =>
      request(api, historicalDataDerivatives, { id: String(options.startOfDay), period: "daily" })
    )
  );
  for (const result of results) {
    const derivatives = result.volumeStats as VolumeStatsQuery[];
    dailyVolume += derivatives.length ? Number(
      Object.values(derivatives[0] || {}).reduce((sum, element) =>
        String(Number(sum) + Number(element))
      )
    ) : 0
  }
  dailyVolume /= 1e30;

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-01-09',
};

export default adapter;
