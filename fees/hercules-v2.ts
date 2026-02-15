import { Chain } from "../adapters/types";
import request from "graphql-request";
import { FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/amm-subgraph-andromeda/"
}

const fetch: FetchV2 = async (options) => {
  const { api, getStartBlock, getEndBlock, createBalances } = options
  const fromBlock = await getStartBlock()
  const toBlock = await getEndBlock()
  const graphQuery = (block: any) => `
      {
        uniswapFactories(block: { number: ${block}}) {
          id
          totalFeeUSD
        }
      }
    `;

  const { uniswapFactories: startRes }: any = await request(endpoints[api.chain], graphQuery(fromBlock))
  const { uniswapFactories: endRes }: any = await request(endpoints[api.chain], graphQuery(toBlock))

  const totalFeesUSD = endRes.reduce((acc: number, val: any) => acc + +val.totalFeeUSD, 0) - startRes.reduce((acc: number, val: any) => acc + +val.totalFeeUSD, 0)

  const dailyFees = createBalances()
  dailyFees.addCGToken('usd-coin', totalFeesUSD, METRIC.SWAP_FEES)

  const dailyProtocolRevenue = dailyFees.clone(0.05, METRIC.PROTOCOL_FEES)
  const dailyHoldersRevenue = dailyFees.clone(0.35, "HERC token holder distributions")
  const dailyRevenue = createBalances()
  dailyRevenue.addBalances(dailyProtocolRevenue)
  dailyRevenue.addBalances(dailyHoldersRevenue)

  const dailySupplySideRevenue = dailyFees.clone(0.6, METRIC.LP_FEES)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees collected on all swaps",
  Revenue: "5% goes to protocol treasury, 35% distributed to HERC token holders",
  SupplySideRevenue: "60% of fees distributed to liquidity providers",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Trading fees collected from token swaps on the DEX',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Portion of swap fees allocated to protocol treasury (5% of total fees)',
    "HERC token holder distributions": 'Portion of swap fees distributed to HERC token holders (35% of total fees)',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Portion of swap fees distributed to liquidity providers (60% of total fees)',
  },
}

export default {
  version: 2,
  adapter: {
    [CHAIN.METIS]: {
      fetch,
      start: '2024-03-11',
    },
  },
  methodology,
  breakdownMethodology,
};
