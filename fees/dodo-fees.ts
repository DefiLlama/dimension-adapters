import { Adapter, } from "../adapters/types";
import { request, gql } from "graphql-request";

const feesReq = gql`
query FetchDashboardPairs($where: Dashboardrate24h_filter) {
	dashboard_pairs_rate_24(where: $where) {
		pages
		pairs
		__typename
	}
}
`

const adapter: Adapter = {
  version: 1,
  adapter: ["ethereum", "bsc", "polygon", "arbitrum", "aurora", "boba"].reduce((all, chain)=>({
    ...all,
    [chain]: {
      fetch: async()=>{
        const pairs = await request("https://gateway.dodoex.io/graphql?opname=FetchDashboardPairs", feesReq,
          { "where": { "page": 1, "limit": 10, "order_direction": "desc", "order_by": "fee", "chain": chain } }, {
          "Content-Type": "application/json",
          "user-agent": "insomnia/2022.5.0"
        })
        const fees = Object.values(pairs.dashboard_pairs_rate_24.pairs)
          .filter((p:any)=> Number(p.tvl) > 1000)
          .reduce((sum:number, p:any)=>sum+Number(p.fee), 0);
        return {
          dailyFees: fees,
          dailyRevenue: fees*0.2,
        };
      },
      runAtCurrTime: true,
          }
  }), {} as any)
};

export default adapter
