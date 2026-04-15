import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cm97l77ib0cz601wlgi9wb0ec/subgraphs/hyperswap-v3/1.0.23/gn'
// const SWAP_TOKEN = '0x03832767bdf9a8ef007449942125ad605acfadb8';
// const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyVolume = options.createBalances()

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
  })

  const dailyRevenue = dailyFees.clone(0.16)
  const dailyProtocolRevenue = dailyFees.clone(0.04)
  const dailySupplySideRevenue = dailyFees.clone(0.84)
  const dailyHoldersRevenue = dailyFees.clone(0.12, 'Token Burns')

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
    'Token Burns': "12% of fees used for buy-back and burn.",
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
