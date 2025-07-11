import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

const fetchCoti = async (_a: any, _b: any, options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()])

  const query = gql`
    query volumes {
      yesterday: totalHistories(block: {number: ${fromBlock}}) {
        timestamp
        tradeVolume
      }
      today: totalHistories(block: {number: ${toBlock}}) {
        timestamp
        tradeVolume
      }
    }
  `;

  const graphRes = await request(endpoints[options.chain], query);
  const todayVolume = graphRes['today'].reduce((p: any, c: any) => p + Number(c.tradeVolume), 0)
  const yesterdayVolume = graphRes['yesterday'].reduce((p: any, c: any) => p + Number(c.tradeVolume), 0)
  const volume24H = todayVolume - yesterdayVolume;

  return {
    dailyVolume: volume24H / 1e18 // convert to wei
  }
}

const fetchBase = async (_a: any, _b: any, options: FetchOptions) => {
  const endpoint = endpoints[options.chain];
  const day = Math.floor(options.endTimestamp / 86400);

  const query = gql`
    query volumes {
      dailyHistories(
        where: { 
          day: ${day}, 
        }
        orderBy: day
        orderDirection: desc
        first: 100
      ) {
        day
        tradeVolume
      }
    }
  `;

  let data = await request(endpoint, query);

  const recordWithVolume = data?.dailyHistories?.find(d => parseFloat(d.tradeVolume || "0") > 0);
  const dailyVolume = parseFloat(recordWithVolume.tradeVolume) / 1e18;

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: '2024-09-08', // October 8, 2024
    },
    [CHAIN.COTI]: {
      fetch: fetchCoti,
      start: '2025-01-01', // January 1, 2025
    },
  },
};

export default adapter;
