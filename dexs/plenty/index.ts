import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const tezos = sdk.chains.tezos

const V2_POOL_CREATORS = [
  'KT1McWUGBxEP92a4CpKo3tzfARF6bM2sw5ff', // volatile swap factory
  'KT1LLaqPmDnVdBP1zxEEpPvy3py4Uk4Bymag', // stable swap factory
  'KT1FG1fFEBv7amGagLeXpCytFwiQAfYmkgFb', // tez swap factory
  'tz1NbDzUQCcV2kp3wxdVHVSZEDeq2h97mweW', // team deployer of the pre-factory pools and the XTZ/ctez pool
]
const V2_POOL_TYPE_HASHES = [896241296, 1278110930, 1973461520, -1622367811, -509362075, -1446613519]
const V3_FACTORY = 'KT1KjKzRxtGiQA1udtoy8i2TV3UF7WjESurP' // V3_FACTORY in Plenty-network/plenty-network-frontend src/config/config.ts
const V3_POOL_TYPE_HASH = -1295705015

// v2 pools: Swap; XTZ/ctez pool: tez_to_ctez / ctez_to_tez; v3 pools: x_to_y / y_to_x
const SWAP_ENTRYPOINTS = ['Swap', 'tez_to_ctez', 'ctez_to_tez', 'x_to_y', 'y_to_x']
const POOLS_PER_REQUEST = 50

async function getPools(): Promise<string[]> {
  const sources = [
    ...V2_POOL_CREATORS.map((creator) => ({ creator, typeHashes: V2_POOL_TYPE_HASHES })),
    { creator: V3_FACTORY, typeHashes: [V3_POOL_TYPE_HASH] },
  ]
  const pools: string[] = []
  for (const { creator, typeHashes } of sources)
    pools.push(...await tezos.tzktAll({ path: '/v1/contracts', params: { creator, 'typeHash.in': typeHashes.join(','), select: 'address' } }))
  return pools
}

async function getTransactions(contractFilter: 'target.in' | 'sender.in', contracts: string[], params: Record<string, string>) {
  const txs: any[] = []
  for (const chunk of sdk.util.sliceIntoChunks(contracts, POOLS_PER_REQUEST))
    txs.push(...await tezos.tzktAll({ path: '/v1/operations/transactions', params: { ...params, [contractFilter]: chunk.join(',') }, limit: 10_000 }))
  return txs
}

// FA2 transfer: [{ from_, txs: [{ to_, token_id, amount }] }]; FA1.2 transfer: { from, to, value }
function decodeTransfer({ target, parameter: { value } }: any) {
  if (Array.isArray(value)) {
    const { to_, token_id, amount } = value[0].txs[0]
    return { to: to_, amount, token: token_id === '0' ? target.address : `${target.address}-${token_id}` }
  }
  return { to: value.to, amount: value.value, token: target.address }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  const window = {
    'timestamp.gt': new Date(options.fromTimestamp * 1000).toISOString(),
    'timestamp.le': new Date(options.toTimestamp * 1000).toISOString(),
    status: 'applied',
  }

  const pools = await getPools()
  const swaps = await getTransactions('target.in', pools, { ...window, 'entrypoint.in': SWAP_ENTRYPOINTS.join(','), select: 'id,hash,target,amount' })
  if (!swaps.length) return { dailyVolume }

  const tradedPools = [...new Set(swaps.map((swap) => swap.target.address))]
  const transfers = await getTransactions('sender.in', tradedPools, { ...window, entrypoint: 'transfer', select: 'id,hash,sender,target,parameter' })
  const transfersByHash: Record<string, any[]> = {}
  for (const transfer of transfers) (transfersByHash[transfer.hash] ??= []).push(transfer)

  for (const swap of swaps) {
    const pool = swap.target.address
  // internal operations run depth-first, so the first token transfer after the swap call belongs to that swap.
  // every pool pulls the sold token before paying out, so it is the amount sold gross of fees. v3 only pulls the filled portion of dx / dy.
    const firstTransfer = (transfersByHash[swap.hash] ?? [])
      .filter((transfer) => transfer.id > swap.id && transfer.sender.address === pool)
      .sort((a, b) => a.id - b.id)[0]
    const sold = firstTransfer && decodeTransfer(firstTransfer)
    if (sold?.to === pool) dailyVolume.add(sold.token, sold.amount)
    // no pull: tez was sold (tez pool Swap or tez_to_ctez), attached to the call in mutez
    else if (swap.amount > 0) dailyVolume.addCGToken('tezos', swap.amount / 1e6)
    else throw new Error(`Plenty swap ${swap.hash} on ${pool}: no sold-token transfer found`)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TEZOS],
  start: '2023-01-01',
  methodology: {
    Volume: 'Tokens sold into Plenty v2 (volatile, stable, tez and XTZ/ctez) and v3 pools on Tezos: for every applied swap, the token transfer the pool pulls from the trader (or the tez attached to the call), gross of fees, read from the TzKT indexer.',
  },
}

export default adapter;
