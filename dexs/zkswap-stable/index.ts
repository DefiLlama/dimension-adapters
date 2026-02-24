import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// const endpoints = {
//   [CHAIN.ERA]: "https://api.studio.thegraph.com/query/49271/zf-exchange-stableswap-3/v0.1.1"
// }

// const graph = getGraphDimensions2({
//   graphUrls: endpoints,
//   totalVolume: {
//     factory: "factories",
//   },
//   feesPercent: {
//     type: "volume",
//     Fees: 0.01,
//     Revenue: 0.0033
//   }
// });

const pools = [
  {
    address: '0x15309aaf4fedf346e5204331027b4ef7b75b1dd7',
    tokens: [
      '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
      '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4',
      '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C',
    ],
    fee: 0.0001, // 0.01%
  },
];

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  for (const pool of pools) {
    const logs = await options.getLogs({
      target: pool.address,
      eventAbi: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
    })
    for (const log of logs) {
      dailyVolume.add(pool.tokens[Number(log.sold_id)], log.tokens_sold)
      dailyFees.add(pool.tokens[Number(log.sold_id)], Number(log.tokens_sold) * pool.fee)
    }
  }

  const dailyRevenue = dailyFees.clone(0.33)
  const dailySupplySideRevenue = dailyFees.clone(67)

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetch,
      start: '2024-11-06',
    }
  },
  methodology: {
    UserFees: "User pays 0.01% fees on each swap.",
    Revenue: "Approximately 33% of the fees go to the protocol.",
    ProtocolRevenue: "Approximately 33% of the fees go to the protocol.",
    SupplySideRevenue: "Approximately 67% of the fees are distributed to liquidity providers (ZFLP token holders)",
  }
}
export default adapters;