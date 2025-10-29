import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async (_: any, __: any, options: FetchOptions) => {
  const dayTimestamp = Math.floor(options.startOfDay / 86400) * 86400;
  const variables = { id: `${dayTimestamp}:daily` };

  const stats = await request(endpoint, statsQuery, variables).catch(() => ({}));

  const volume = stats.volumeStat;
  const fees = stats.feeStat;

  const dailyVolume = Object.values(volume).reduce((a: number, b: any) => a + Number(b || 0) / 1e30, 0);
  const dailyFees = Object.values(fees).reduce((a: number, b: any) => a + Number(b || 0) / 1e30, 0);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2024-07-01',
  chains: [CHAIN.BSC],
  methodology: {
    Fees: "trading fees (swap, margin, mint, burn, liquidation) paid by users.",
    Revenue: "revenue from trading fees (swap, margin, mint, burn, liquidation) paid by users.",
    ProtocolRevenue: "revenue from trading fees (swap, margin, mint, burn, liquidation) goes to the protocol.",
  }
};

export default adapter;
