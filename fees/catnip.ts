import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

// Alley (Catnip DEX) — Uniswap V2 fork, fixed 0.30% swap fee.
// Factory feeTo is currently unset, so LPs receive the full fee and protocol revenue is 0.
const FACTORY = '0x002EC9782d70f4e79396c58964D4691cA648FB49'
const CATNIP_WETH = '0xc08751E47611F035B958889557EDBBE33d4a8Bce'
const SWAP_FEE = 0.003 // 0.30%
const SWAP_EVENT = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const remap = (token: string) =>
  token.toLowerCase() === CATNIP_WETH.toLowerCase()
    ? ADDRESSES.robinhood.WETH
    : token

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options

  const pairLength = await api.call({ target: FACTORY, abi: 'uint256:allPairsLength' })
  const pairIndexes = Array.from({ length: Number(pairLength) }, (_, i) => i)
  // Only a handful of Alley pairs today; enumerate all of them instead of filtering by priced TVL.
  const pairs = await api.multiCall({
    abi: 'function allPairs(uint256) view returns (address)',
    calls: pairIndexes.map((i) => ({ target: FACTORY, params: [i] })),
  })
  const token0s = await api.multiCall({ abi: 'address:token0', calls: pairs })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pairs })

  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const allLogs = await getLogs({ targets: pairs, eventAbi: SWAP_EVENT, flatten: false })
  allLogs.forEach((logs: any[], index: number) => {
    if (!logs.length) return
    // Remap Catnip WETH -> Robinhood WETH only for pricing; amounts still come from on-chain Swap logs.
    const token0 = remap(token0s[index])
    const token1 = remap(token1s[index])
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * SWAP_FEE, amount1: Number(log.amount1In) * SWAP_FEE })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * SWAP_FEE, amount1: Number(log.amount1Out) * SWAP_FEE })
    })
  })

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  UserFees: 'User pays 0.30% fees on each swap.',
  Fees: 'A 0.30% fee is collected on each swap.',
  SupplySideRevenue: 'LPs receive the full 0.30% swap fee while protocol fee collection is disabled.',
  ProtocolRevenue: 'Protocol feeTo is unset, so the protocol receives 0%.',
  Revenue: 'Protocol fee collection is disabled; revenue is 0.',
  HoldersRevenue: 'No holder fee share.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-07-14',
    },
  },
}

export default adapter
