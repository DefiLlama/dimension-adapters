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

const methodology = {
  Fees: "All swap fees collected from DODO trading pairs across all pools",
  Revenue: "20% of swap fees retained by the protocol treasury",
  SupplySideRevenue: "80% of swap fees distributed to liquidity providers"
}

const breakdownMethodology = {
  Fees: {
    "Swap fees": "Fees charged on token swaps across all DODO trading pairs, excluding pairs with TVL under $1,000"
  },
  Revenue: {
    "Protocol fees": "20% of swap fees allocated to the DODO protocol treasury"
  }
}

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
  }), {} as any),
  methodology,
  breakdownMethodology
};

export default adapter
