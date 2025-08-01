import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

const fetchCoti = async (_a: any, _b: any, options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()])
  const query = gql`
    query fees {
      yesterday: totalHistories(block: {number: ${fromBlock}}) {
        timestamp
        platformFee
      }
      today: totalHistories(block: {number: ${toBlock}}) {
        timestamp
        platformFee
      }
    }
  `;
  const graphRes = await request(endpoints[options.chain], query);
  const todayFees = graphRes['today'].reduce((p: any, c: any) => p + Number(c.platformFee), 0)
  const yesterdayFees = graphRes['yesterday'].reduce((p: any, c: any) => p + Number(c.platformFee), 0)
  const fees24H = todayFees - yesterdayFees;
  const dailyFees = fees24H / 1e18; // convert from wei

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const fetchBase = async (_a: any, _b: any, options: FetchOptions) => {
  const endpoint = endpoints[options.chain];
  const day = Math.floor(options.endTimestamp / 86400);
  const query = gql`
    query fees {
      dailyHistories(
        where: { 
          day: ${day}, 
        }
        orderBy: day
        orderDirection: desc
        first: 100
      ) {
        day
        platformFee
      }
    }
  `;
  let data = await request(endpoint, query);
  const recordWithFees = data?.dailyHistories?.find(d => parseFloat(d.platformFee || "0") > 0);
  const dailyFees = parseFloat(recordWithFees?.platformFee || "0") / 1e18;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Platform fees collected by PriveX from derivatives trading activities",
  Revenue: "All platform fees collected represent protocol revenue",
  ProtocolRevenue: "All platform fees collected represent protocol revenue",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: "2024-09-08",
      meta: { methodology },
    },
    [CHAIN.COTI]: {
      fetch: fetchCoti,
      start: "2025-01-01",
      meta: { methodology },
    },
  },
};

export default adapter;
