import { request, gql } from "graphql-request";
import { Adapter } from "../../helpers/types";

const endpoint = "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/project_clhjdosm96z2v4/moneyx-stats/gn";

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

  const stats = await request(endpoint, statsQuery, variables).catch(() => ({}));

  const volume = stats.volumeStat || {};
  const fees = stats.feeStat || {};

  const dailyVolume = Object.values(volume).reduce((a: number, b: any) => a + Number(b || 0) / 1e30, 0);
  const dailyFees = Object.values(fees).reduce((a: number, b: any) => a + Number(b || 0) / 1e30, 0);

  return {
    timestamp: dayTimestamp,
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees, // all fees go to protocol
  };
};

const adapter: Adapter = {
  adapter: {
    bsc: {
      fetch: fetchVolume,
      start: async () => 1720000000, // ~July 2024
      meta: {
        name: "MoneyX",
        chain: "Binance Smart Chain",
        category: "derivatives",
        website: "https://moneyxpro.com",
        source: "Goldsky Subgraph",
        methodology: {
          Fees: "All protocol fees (swap, margin, mint, burn, liquidation) are tracked from the FeeStat entity in the Goldsky subgraph.",
        },
      },
    },
  },
};

export default adapter;
