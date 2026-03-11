import { CHAIN } from "../helpers/chains";
import request from "graphql-request";
import { FetchOptions, } from "../adapters/types";

export const BABYDOGE_GRAPHQL_ENDPOINT =
  "https://gateway.thegraph.com/api/9ce7bb24f9764358478f6a82c68e7ad3/subgraphs/id/9a8QustfXaMcrBcdB3rZidfLHjGa2eW1AVbUzHUQD3qb";

export const fetch = async (_: number, _ctx: any, options: FetchOptions,) => {
  const q = `
    query {
      poolDayDatas(first: 1000 where: { date: ${options.startOfDay}}) {  id date volumeUSD feesUSD }
    }
  `;

  const { poolDayDatas } = await request(BABYDOGE_GRAPHQL_ENDPOINT, q);
  if (!poolDayDatas.length) throw new Error("No data for " + options.dateString);

  const dailyVolume = poolDayDatas.reduce((acc: string, d: any) => acc + +d.volumeUSD, 0)
  const dailyFees = poolDayDatas.reduce((acc: string, d: any) => acc + +d.feesUSD, 0)

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees * 0.97,
    dailyProtocolRevenue: dailyFees * 0.03,
    dailyHoldersRevenue: 0,
    dailyRevenue: dailyFees * 0.03,
  }
}

export default {
  fetch,
  start: '2025-07-15',
  chains: [CHAIN.BSC],
  methodology: {
    Fees: "All swap fees paid by users.",
    Revenue: "Protocol keeps 3% of swap fees as revenue.",
    ProtocolRevenue: "3% of swap fees.",
    SupplySideRevenue: "Remaining 97% of fees.",
  }
}
