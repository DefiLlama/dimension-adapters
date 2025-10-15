import request from "graphql-request";
import { ChainEndpoints, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints: ChainEndpoints = {
  [CHAIN.SEI]: "https://graph.jellyverse.org/"
};


async function fetch(_: any, _1: any, { toTimestamp, chain }: FetchOptions) {
  const todayInt = Math.floor(toTimestamp / 86400)
  const yesterdayInt = todayInt - 1
  const query = `
      query volumes {
        today: balancerSnapshot(id: "2-${todayInt}") {
          totalSwapVolume
          totalSwapFee
          totalProtocolFee
        }
        yesterday: balancerSnapshot(id: "2-${yesterdayInt}") {
          totalSwapVolume
          totalSwapFee
          totalProtocolFee
        }
      }
    `

  const { today, yesterday } = await request(endpoints[chain], query);
  if (!today || !yesterday)
    throw new Error("No data found");

  return {
    dailyVolume: today.totalSwapVolume - yesterday.totalSwapVolume,
    dailyFees: today.totalSwapFee - yesterday.totalSwapFee,
    dailyRevenue: today.totalProtocolFee - yesterday.totalProtocolFee,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: '2024-06-01',
    }
  }
}

export default adapter;
