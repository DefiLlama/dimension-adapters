import { Balances } from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getUniV2LogAdapter } from '../helpers/uniswap'

const feeConfig = {
  fees: 0.0025,
  userFeesRatio: 1,
  revenueRatio: 1 / 6,
  protocolRevenueRatio: 1 / 6,
  allowReadPairs: true,
}

// firstPairBlock: getUniV2LogAdapter throws on a factory with no pairs, so windows ending before it skip that factory.
type Factory = { factory: string, firstPairBlock?: number }

// start is the deployment UTC date of the chain's first factory.
const chainConfig: Record<string, { start: string, factories: Factory[] }> = {
  [CHAIN.SONEIUM]: {
    start: '2025-12-15',
    factories: [
      // deploy 2025-12-15 01:47 UTC, tx 0x9f581dd19987a5734aae19d1f6c5cfa4b9e379ef970cf5ea2b914701e16b8a58
      { factory: '0x06C0b58287794a0bdce20ce768b601CA974618DC' },
      // Replacement factory whose pairs have no admin withdrawal. Verified VibePair (solc 0.8.30, e.g. pair
      // 0x9726eceb595376765f7391e16e438cfb7b8d71f2) keeps the 25/10000 swap check, the (rootK * 5) + rootKLast
      // _mintFee denominator and the same feeTo. Both factories' pairs are summed.
      // Deploy 2026-11-10 03:56:01 UTC, block 30574105, tx 0x69f8165d69abe21ac04f9e9b2e05e67fe97a2fd7ee976d97732068c0a2e57ad4.
      // allPairsLength is 0 at block 30575038 and 1 at 30575039.
      { factory: '0x77b141dCFDa726e239efF005E3DE7A47AeBFf948', firstPairBlock: 30575039 },
    ],
  },
  [CHAIN.ASTAR]: {
    start: '2025-12-17',
    // deploy 2025-12-17 00:53 UTC, tx 0x4b827d33029655df52a66acabb6c404cdf334cfb0086c9f8a2c91110647930d5; first pair after feeTo
    factories: [{ factory: '0x1b404A1e41cCe5f98DC9CBF0c1372F8b68e2588c' }],
  },
  [CHAIN.BSC]: {
    start: '2026-02-18',
    // deploy 2026-02-18 03:53 UTC, block 81868992; first pair 04:47 UTC after feeTo
    factories: [{ factory: '0xaf905e66038EcE89e03D843B35a11D262053B630' }],
  },
  [CHAIN.ARBITRUM]: {
    start: '2026-11-05',
    // deploy 2026-11-05 05:04 UTC, block 521383212; feeTo set 05:11 UTC, first pair 05:41 UTC
    factories: [{ factory: '0xA95107ebE4e54480bA755061eF3207c3421150f0' }],
  },
}

// Metrics getUniV2LogAdapter returns for feeConfig
const METRICS = ['dailyVolume', 'dailyFees', 'dailyUserFees', 'dailyRevenue', 'dailyProtocolRevenue', 'dailySupplySideRevenue']

const fetch = async (options: FetchOptions) => {
  const result: Record<string, Balances> = {}
  for (const metric of METRICS) result[metric] = options.createBalances()

  for (const { factory, firstPairBlock } of chainConfig[options.chain].factories) {
    if (firstPairBlock && (await options.getToBlock()) < firstPairBlock) continue
    const res = await getUniV2LogAdapter({ factory, ...feeConfig })(options)
    // the helper returns 0 instead of balances when no pair passes its liquidity filter
    for (const metric of METRICS) if (typeof res[metric] === 'object') result[metric].add(res[metric])
  }

  return result
}

const methodology = {
  Volume: 'Volume is calculated from Swap events on VibeSwap pairs created by the VibeSwap factories.',
  Fees: 'Each swap pays a 0.25% fee.',
  UserFees: 'Users pay a 0.25% fee on each swap.',
  Revenue: '1/6 of swap fees (~0.0417%) accrue to the protocol via the factory feeTo LP mint.',
  ProtocolRevenue: '1/6 of swap fees (~0.0417%) go to the protocol feeTo address.',
  SupplySideRevenue: '5/6 of swap fees (~0.2083%) go to liquidity providers.',
}

const breakdownMethodology = {
  Fees: { 'Token Swap Fees': methodology.Fees },
  UserFees: { 'Trading fees': methodology.UserFees },
  Revenue: { 'Protocol fees': methodology.Revenue },
  ProtocolRevenue: { 'Protocol fees': methodology.ProtocolRevenue },
  SupplySideRevenue: { 'LP fees': methodology.SupplySideRevenue },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter
