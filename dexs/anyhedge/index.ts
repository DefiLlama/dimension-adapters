import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { postURL } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Volume: "BCH locked in AnyHedge contracts that were settled (matured, liquidated or mutually redeemed) during the period, valued at the BCH price. Same method as the community indexer https://gitlab.com/0353F40E/anyhedge-stats, read directly from the chain.",
}

const CHAINGRAPH_URL = 'https://gql.chaingraph.pat.mn/v1/graphql'
const MAX_INDEXER_LAG = 60 * 60

const CONTRACT_BODIES = [
  // v0.11
  '5c79009c637b695c7a7cad5b7a7cad6d6d6d6d6d51675c7a519dc3519d5f7a5f795779bb5d7a5d79577abb5c79587f77547f75817600a0695c79587f77547f75818c9d5c7a547f75815b799f695b795c7f77817600a0695979a35879a45c7a547f7581765c7aa2695b7aa2785a7a8b5b7aa5919b690276587a537a96a47c577a527994a4c4529d00cc7b9d00cd557a8851cc9d51cd547a8777777768',
  // v0.12
  '5d79009c637b695d7a7cad5c7a7cad6d6d6d6d6d7551675d7a519dc3519d607a60795779bb5e7a5e79577abb5d79587f77547f75817600a0695d79587f77547f75818c9d5d7a547f75815c799f695c795c7f77817600a0695a79a35979a45d7a547f7581765d7aa2695c7aa2785b7a8b5c7aa5919b690276587a537a96587a94a47c577a527994a4c4529d00cc7b9d00cd557a8851cc9d51cd547a8777777768',
]

const settlementsQuery = `query ($from: bigint!, $to: bigint!, $patterns: [input_bool_exp!]!) {
  tip: block(limit: 1, order_by: { height: desc }) { timestamp }
  input(where: { _or: $patterns, transaction: { block_inclusions: { block: { timestamp: { _gte: $from, _lt: $to } } } } }) {
    value_satoshis
    transaction { block_inclusions { block { timestamp accepted_by { node_internal_id } } } }
  }
}`

async function querySettlements(from: number, to: number) {
  const variables = { from, to, patterns: CONTRACT_BODIES.map(body => ({ redeem_bytecode_pattern: { _like: '%' + body } })) }
  let lastError: any
  // the public instance occasionally answers with a "database query error" (statement timeout) that succeeds on retry
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(10_000 * i)
    const res = await postURL(CHAINGRAPH_URL, { query: settlementsQuery, variables })
    if (res.data) return res.data
    lastError = res.errors
  }
  throw new Error(`Chaingraph query failed: ${JSON.stringify(lastError)}`)
}

const fetch = async (options: FetchOptions) => {
  const { tip, input } = await querySettlements(options.startTimestamp, options.endTimestamp)
  if (!tip.length || Number(tip[0].timestamp) < options.endTimestamp - MAX_INDEXER_LAG)
    throw new Error(`Chaingraph tip is more than an hour behind ${new Date(options.endTimestamp * 1000).toISOString()}`)

  let settledSats = 0n
  for (const { value_satoshis, transaction } of input) {
    const inWindow = transaction.block_inclusions.some(({ block }: any) =>
      block.accepted_by.length && Number(block.timestamp) >= options.startTimestamp && Number(block.timestamp) < options.endTimestamp)
    if (inWindow) settledSats += BigInt(value_satoshis)
  }

  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken('bitcoin-cash', Number(settledSats) / 1e8);

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BITCOIN_CASH],
  start: '2022-06-09',
  methodology,
};

export default adapter;
