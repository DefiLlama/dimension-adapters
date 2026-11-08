// THORWallet is a self-custodial wallet whose native swaps route through THORChain and MAYAChain.
// Every swap memo carries THORWallet's affiliate name, which each chain's Midgard indexer records
// per swap, so only THORWallet's own swaps are counted (not the whole chain's volume).
// THORWallet also routes swaps through NEAR Intents, Chainflip, 1inch and others; those are not
// tracked here.
//
// Affiliate names:
// - w1 (since 2026-08-13): resolves to 0x19Dd3215A1C7CA4459d9C9F277654E5D266737dc, the
//   AFFILIATE_ADDRESS in THORWallet's own splitter scripts
//   (https://github.com/THORWallet/TGT-TITN-merge-contracts/blob/main/scripts/splitterSetup.ts).
//   Owner thor1awn7l5a8u9a7mlypcsgevrjfe2gtyhjwnsng25 / maya1awn7l5a8u9a7mlypcsgevrjfe2gtyhjwn8dyuy.
// - wr (2022-07-18 to 2026-08-13): the previous name. On MAYAChain it resolves to the same
//   0x19Dd3215 collector, and on THORChain its swaps stopped on the day w1 started, with 78 of the
//   283 wr senders from 2026-06-15..08-12 moving to w1. After the switch the app no longer uses it
//   (THORChain: 4 swaps / $221 from 08-13 to 09-30, MAYAChain: 6 swaps / $22 to 11-08), so wr is
//   only counted up to the switch day.
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { httpGet } from '../../utils/fetchURL'

const W1_SWITCH_END = Date.UTC(2026, 7, 14) / 1e3 // end of 2026-08-13, the day THORWallet moved from wr to w1
const headers = { 'x-client-id': 'defillama' }

const chainConfig: Record<string, { start: string; midgard: string; baseUnits: (asset: string) => number }> = {
  [CHAIN.THORCHAIN]: {
    start: '2022-07-18', // first wr swap
    midgard: 'https://gateway.liquify.com/chain/thorchain_midgard/v2',
    baseUnits: () => 1e8, // THORChain reports every asset in 1e8 units
  },
  [CHAIN.MAYA]: {
    start: '2023-04-20', // first wr swap
    midgard: 'https://midgard.mayachain.info/v2',
    // CACAO has 10 decimals, every other asset is reported in 1e8 units
    // https://docs.mayaprotocol.com/mayachain-dev-docs/introduction/technology/native-assets
    baseUnits: (asset) => asset === 'MAYA.CACAO' ? 1e10 : 1e8,
  },
}

type Coin = { asset: string; amount: string }
type SwapAction = {
  date: string // nanoseconds
  status: string
  in: { coins: Coin[] }[]
  metadata: { swap: { inPriceUSD: string; streamingSwapMeta?: { inCoin: Coin } } }
}

// Midgard pages backwards in time: the first page holds the newest swaps before `timestamp`, and
// nextPageToken continues to older ones (it cannot be combined with a time filter).
async function getSwaps(midgard: string, affiliates: string, start: number, end: number): Promise<SwapAction[]> {
  const swaps: SwapAction[] = []
  let pageToken = ''
  while (true) {
    const query = pageToken ? `nextPageToken=${pageToken}` : `timestamp=${end}`
    const { actions, meta } = await httpGet(`${midgard}/actions?type=swap&affiliate=${affiliates}&limit=50&${query}`, { headers })
    for (const action of actions as SwapAction[]) {
      const time = Number(action.date) / 1e9
      if (time >= end) continue
      if (time < start) return swaps
      swaps.push(action)
    }
    if (!meta.nextPageToken || !actions.length) return swaps
    pageToken = meta.nextPageToken
  }
}

const fetch = async (options: FetchOptions) => {
  const { midgard, baseUnits } = chainConfig[options.chain]
  // a window Midgard has not indexed to the end yet would be stored short, throw so it is retried
  const { lastCommitted } = await httpGet(`${midgard}/health`, { headers })
  if (!(lastCommitted?.timestamp >= options.endTimestamp))
    throw new Error(`thorwallet: ${options.chain} Midgard indexed up to ${lastCommitted?.timestamp}, window ends ${options.endTimestamp}`)

  const affiliates = options.startTimestamp < W1_SWITCH_END ? 'w1,wr' : 'w1'
  const swaps = await getSwaps(midgard, affiliates, options.startTimestamp, options.endTimestamp)

  const dailyVolume = options.createBalances()
  for (const swap of swaps) {
    const { inPriceUSD, streamingSwapMeta } = swap.metadata.swap
    const price = Number(inPriceUSD)
    if (!Number.isFinite(price)) throw new Error(`thorwallet: swap at ${swap.date} on ${options.chain} has no inPriceUSD`)
    // a finished streaming swap can execute less than the deposit (the rest is refunded), inCoin is what was swapped
    const coins = swap.status === 'success' && streamingSwapMeta?.inCoin ? [streamingSwapMeta.inCoin] : swap.in.flatMap((i) => i.coins)
    for (const coin of coins) dailyVolume.addUSDValue(Number(coin.amount) / baseUnits(coin.asset) * price)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // the swaps execute in THORChain and MAYAChain pools, already counted in those listings
  doublecounted: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'USD value of swaps made in the THORWallet app that route through THORChain and MAYAChain, identified by THORWallet\'s affiliate name (w1 since 2026-08-13, wr before) and valued at the input asset\'s price at swap time. Excludes THORWallet swaps routed through NEAR Intents, Chainflip, 1inch and other providers.',
  },
}

export default adapter
