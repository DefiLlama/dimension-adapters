import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";

const graphURL = 'https://api.mainnet.aptoslabs.com/v1/graphql'
const query = (txHeight?: number) => `query GetAccountTransactionsData {
  events(
    where: {
    ${txHeight ? `transaction_block_height: {_lt: ${txHeight}},` : ''}
    indexed_type: {_eq: "0xbd35135844473187163ca197ca93b2ab014370587bb0ed3befff9e902d6bb541::amm::SwapEvent"},
    account_address: {_eq: "0xbd35135844473187163ca197ca93b2ab014370587bb0ed3befff9e902d6bb541"}}
    limit: 1000
    order_by: {transaction_block_height: desc}
  ) {
    data, transaction_block_height
  }
}`

async function fetch({ createBalances, fromTimestamp, api, toTimestamp, }: FetchOptions) {
  const dailyVolume = createBalances()
  let hasMore = true
  let lastTxHeight
  const client = new GraphQLClient(graphURL)
  const aDayAgo = new Date().getTime() / 1e3 - 86400 // this way we make fewer queries
  let i = 0
  do {
    const { events } = await client.request(query(lastTxHeight))
    let lastTimestamp = 0
    events.forEach(({ data: e, transaction_block_height }: any) => {
      lastTimestamp = e.timestamp / 1e3
      lastTxHeight = transaction_block_height
      // if (e.timestamp / 1e6 > toTimestamp) return;
      // if (hasMore && e.timestamp / 1e6 > fromTimestamp) {
      if (hasMore && e.timestamp / 1e6 > aDayAgo) {
        dailyVolume.add(e.out_coin_type, e.out_au)
      } else {
        hasMore = false
      }
    })

    api.log(`${++i} ${lastTxHeight} [Aux fi] Fetched ${events.length} events, last timestamp: ${new Date(lastTimestamp).toString().split('(')[0]} fetching till ${new Date(fromTimestamp * 1000).toString().split('(')[0]}`)
  } while (hasMore)

  return { dailyVolume, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2023-11-09',
      runAtCurrTime: true,
    },
  },
};

export default adapter;
