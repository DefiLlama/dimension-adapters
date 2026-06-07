import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const GRAPH_URL = 'https://api.subgraph.ormilabs.com/api/public/33c67399-d625-4929-b239-5709cd66e422/subgraphs/hyperswap-v3/v0.1.2/gn'
// const SWAP_TOKEN = '0x03832767bdf9a8ef007449942125ad605acfadb8';
// const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const query = gql`
      query q{
        uniswapDayDatas(where: {date: ${options.startOfDay}}, first: 1000, orderBy: volumeUSD, orderDirection: desc) {
          volumeUSD
          feesUSD
        }
      }
    `

  const data = await request(GRAPH_URL, query)

  data.uniswapDayDatas.forEach((e: any) => {
    dailyVolume.addUSDValue(Number(e.volumeUSD))
    dailyFees.addUSDValue(Number(e.feesUSD), METRIC.SWAP_FEES)
    dailyRevenue.addUSDValue(Number(e.feesUSD) * 0.04, 'Token Swap Fees To Protocol')
    dailyRevenue.addUSDValue(Number(e.feesUSD) * 0.12, 'Token Swap Fees To Buy Back And Burn SWAP')
    dailyProtocolRevenue.addUSDValue(Number(e.feesUSD) * 0.04, 'Token Swap Fees To Protocol')
    dailySupplySideRevenue.addUSDValue(Number(e.feesUSD) * 0.84, 'Token Swap Fees To LPs')
    dailyHoldersRevenue.addUSDValue(Number(e.feesUSD) * 0.12, METRIC.TOKEN_BUY_BACK)
  })

  // const dailyHoldersRevenue = options.createBalances();
  // // Track token burns
  // const burnLogs = await options.getLogs({
  //   target: SWAP_TOKEN,
  //   eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  //   topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "", BURN_ADDRESS],
  // });

  // for (const log of burnLogs) {
  //   dailyRevenue.add(SWAP_TOKEN, log.value, 'Token Burns');
  //   dailyHoldersRevenue.add(SWAP_TOKEN, log.value, 'Token Burns');
  // }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: "Total swap fees paid by users.",
  Revenue: "4% protocol revenue share and 12% reserved for token buy-back and burn.",
  ProtocolRevenue: "4% of fees collected by the protocol.",
  SupplySideRevenue: "84% of fees distributed to LPs.",
  HoldersRevenue: "12% of fees used for buy-back and burn.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Total swap fees paid by users.",
  },
  Revenue: {
    'Token Swap Fees To Protocol': "4% of fees collected by the protocol.",
    'Token Swap Fees To Buy Back And Burn SWAP': "12% of fees used for buy-back and burn.",
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': "84% of fees distributed to LPs.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "12% of fees used for buy-back and burn.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-18',
  methodology,
  breakdownMethodology,
}

export default adapter
