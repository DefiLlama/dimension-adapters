import { Adapter, FetchOptions } from "../adapters/types";
import { request, gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";

const feesReq = gql`
query FetchDashboardPairs($where: Dashboardrate24h_filter) {
	dashboard_pairs_rate_24(where: $where) {
		pages
		pairs
		__typename
	}
}
`

const dfioFetch = async (options: FetchOptions) => {
  const dvmFactory = '0xc93870594C7f83A0aE076c2e30b494Efc526b68E';

  const poolCreatedLogs = await options.getLogs({
    target: dvmFactory,
    eventAbi: "event NewDVM (address baseToken, address quoteToken, address creator, address dvm)",
    fromBlock: 3510162,
    cacheInCloud: true,
  });

  const pools = poolCreatedLogs.map((log) => log.dvm);

  const SWAP_ABI =
    "event DODOSwap(address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address trader, address receiver)";

  const swapVolume = options.createBalances();

  const swapLogs = await options.getLogs({
    targets: pools,
    eventAbi: SWAP_ABI,
  });

  for (const log of swapLogs) {
    addOneToken({ chain: options.chain, balances: swapVolume, token0: log.fromToken, amount0: log.fromAmount, token1: log.toToken, amount1: log.toAmount });
  }

  const dailyFees = swapVolume.clone(0.3 / 100, METRIC.SWAP_FEES)
  const dailySupplySideRevenue = swapVolume.clone(0.3 * 0.8 / 100, METRIC.LP_FEES)
  const dailyProtocolRevenue = swapVolume.clone(0.3 * 0.2 / 100, METRIC.PROTOCOL_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const fetch = async (options: FetchOptions) => {
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
  adapter: {
    [CHAIN.DFIO_META_MAIN]: { fetch: dfioFetch },
    [CHAIN.ETHEREUM]: { fetch },
    [CHAIN.BSC]: { fetch },
    [CHAIN.POLYGON]: { fetch },
    [CHAIN.ARBITRUM]: { fetch },
    [CHAIN.AURORA]: { fetch },
    [CHAIN.BOBA]: { fetch },
  },
  runAtCurrTime: true,
  methodology,
  breakdownMethodology
};

export default adapter
