import { request, gql } from "graphql-request";
import { Adapter } from "../../helpers/types";

const endpoints = {
  stats: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/project_clhjdosm96z2v4/moneyx-stats/gn",
  trades: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/moneyx-trades/v1.0.1/gn",
  raw: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/moneyx-raw/v1.0.0/gn",
};

const statsQuery = gql`
  query volume($id: String!) {
    volumeStat(id: $id) {
      swap
      margin
      burn
      mint
      liquidation
    }
    feeStat(id: $id) {
      swap
      margin
      burn
      mint
      liquidation
    }
  }
`;

const fetchVolume = async (timestamp: number) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  const variables = { id: `${dayTimestamp}:daily` };

  const stats = await request(endpoints.stats, statsQuery, variables).catch(() => ({}));

  const volume = stats.volumeStat || {};
  const fees = stats.feeStat || {};

  const dailyVolume = Object.values(volume).reduce(
    (a: number, b: any) => a + Number(b || 0) / 1e30,
    0
  );
  const dailyFees = Object.values(fees).reduce(
    (a: number, b: any) => a + Number(b || 0) / 1e30,
    0
  );

  return { timestamp: dayTimestamp, dailyVolume, dailyFees };
};

const adapter: Adapter = {
  adapter: {
    bsc: {
      fetch: fetchVolume,
      start: async () => 1720000000,
    },
  },
};

export default adapter;
