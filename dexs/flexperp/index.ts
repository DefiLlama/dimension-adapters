import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

const chainConfig: Record<string, { url: string, start: string }> = {
  [CHAIN.BASE]: {
    url: "https://api.goldsky.com/api/public/project_cmgz6cyvn000i2bp2fv9nefon/subgraphs/base-mainnet-stats/prod/gn",
    start: '2025-02-20',
  },
};

type MarketStat = {
  id: string;
  totalTradingVolume: string;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const [prevDayBlock, toDayBlock] = await Promise.all([
    options.getStartBlock(),
    options.getEndBlock(),
  ]);

  const todayTotalTradingVolumeQuery = gql`
    {
      marketStats(first: 100, block: {number: ${toDayBlock}}) {
        id
        totalTradingVolume
      }
    }
  `;

  const yesterdayTotalTradingVolumeQuery = gql`
    {
      marketStats(first: 100, block: {number: ${prevDayBlock}}) {
        id
        totalTradingVolume
      }
    }
  `;

  const graphQLClient = new GraphQLClient(chainConfig[options.chain].url);
  graphQLClient.setHeader("origin", "https://flex.trade");

  const [{ marketStats: yesterdayMarketStats }, { marketStats: todayMarketStats }] = await Promise.all([
    graphQLClient.request(yesterdayTotalTradingVolumeQuery, { block: prevDayBlock - 50 }),
    graphQLClient.request(todayTotalTradingVolumeQuery, { block: toDayBlock - 50 }),
  ]);

  const yesterdayTotalVolume = yesterdayMarketStats.reduce(
    (accum, t) => accum + parseInt(t.totalTradingVolume),
    0 as number
  ) / 1e30;
  const todayTotalVolume = todayMarketStats.reduce(
    (accum, t) => accum + parseInt(t.totalTradingVolume),
    0 as number
  ) / 1e30;

  const dailyVolume = todayTotalVolume - yesterdayTotalVolume;
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
};

export default adapter;
