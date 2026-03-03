import { Adapter, FetchOptions } from "../adapters/types";
import { request, gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const feesReq = gql`
query FetchDashboardPairs($where: Dashboardrate24h_filter) {
	dashboard_pairs_rate_24(where: $where) {
		pages
		pairs
		__typename
	}
}
`

const fetch = async (_t: any, _b: any, options: FetchOptions) => {
  const pairs = await request("https://gateway.dodoex.io/graphql?opname=FetchDashboardPairs", feesReq,
    { "where": { "page": 1, "limit": 10, "order_direction": "desc", "order_by": "fee", "chain": options.chain } }, {
    "Content-Type": "application/json",
    "user-agent": "insomnia/2022.5.0"
  })
  const fees = Object.values(pairs.dashboard_pairs_rate_24.pairs)
    .filter((p: any) => Number(p.tvl) > 1000)
    .reduce((sum: number, p: any) => sum + Number(p.fee), 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
  const dailyRevenue = dailyFees.clone(0.2, METRIC.PROTOCOL_FEES);
  const dailySupplySideRevenue = dailyFees.clone(0.8, METRIC.LP_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "All swap fees collected from DODO trading pairs across all pools",
  Revenue: "20% of swap fees retained by the protocol treasury",
  SupplySideRevenue: "80% of swap fees distributed to liquidity providers"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees charged on token swaps across all DODO trading pairs, excluding pairs with TVL under $1,000"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "20% of swap fees allocated to the DODO protocol treasury"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "80% of swap fees distributed to liquidity providers"
  }
}

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.POLYGON, CHAIN.ARBITRUM, CHAIN.AURORA, CHAIN.BOBA],
  fetch,
  runAtCurrTime: true,
  methodology,
  breakdownMethodology
};

export default adapter
