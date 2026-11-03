import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniV2LogAdapter } from '../../helpers/uniswap'
import ADDRESSES from '../../helpers/coreAssets.json'

const V2_FACTORY = '0x65b3cc7a7cb167221266fc93884717de2dbd074e'

const TOTAL_SWAP_FEE = 0.0025
const PROTOCOL_FEE_SHARE = 8 / 25
const ZERO_ADDRESS = ADDRESSES.null

const fetchV2 = getUniV2LogAdapter({
  factory: V2_FACTORY,
  fees: TOTAL_SWAP_FEE,
  allowReadPairs: true,
})

const fetch = async (options: FetchOptions) => {
  const result = await fetchV2(options)
  const feeTo = await options.api.call({ target: V2_FACTORY, abi: 'address:feeTo' })
  const feeOn = feeTo && feeTo.toLowerCase() !== ZERO_ADDRESS
  const dailyFees = result.dailyFees

  return {
    ...result,
    dailyUserFees: dailyFees.clone(1, 'Trading fees'),
    dailyRevenue: feeOn ? dailyFees.clone(PROTOCOL_FEE_SHARE, 'Protocol fees') : 0,
    dailyProtocolRevenue: feeOn ? dailyFees.clone(PROTOCOL_FEE_SHARE, 'Protocol fees') : 0,
    dailySupplySideRevenue: dailyFees.clone(feeOn ? 1 - PROTOCOL_FEE_SHARE : 1, 'LP fees'),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: '2022-04-26',
  methodology: {
    Volume: 'Volume is derived from Swap events emitted by BitBlocks Finance V2 pairs on BNB Smart Chain.',
    Fees: 'Traders pay a 0.25% fee on every V2 swap.',
    UserFees: 'Users pay the full 0.25% swap fee charged by V2 pairs.',
    Revenue: '32% of V2 swap fees go to the protocol while feeTo is enabled on the factory.',
    ProtocolRevenue: '32% of V2 swap fees accrue to the protocol through LP token minting while feeTo is enabled.',
    SupplySideRevenue: 'Liquidity providers receive V2 swap fees minus the protocol share.',
  },
  breakdownMethodology: {
    Fees: { 'Token Swap Fees': 'Trading fees paid by users on V2 swaps.' },
    UserFees: { 'Trading fees': 'The full trading fee paid by swap users.' },
    Revenue: { 'Protocol fees': 'The portion of swap fees accruing to the protocol.' },
    ProtocolRevenue: { 'Protocol fees': 'Swap fees controlled by the BitBlocks Finance protocol.' },
    SupplySideRevenue: { 'LP fees': 'The portion of swap fees accruing to liquidity providers.' },
  },
}

export default adapter
