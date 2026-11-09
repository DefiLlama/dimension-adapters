import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const FACTORY = '0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'

const SWAP_EVENT = 'event Swap(address indexed tokenX, address indexed tokenY, uint24 indexed fee, bool sellXEarnY, uint256 amountX, uint256 amountY, int24 currentPoint)'
const FEE_DENOMINATOR = 1e6

const PRICED_TOKENS = [
  '0xd3bf53dac106a0290b0483ecbc89d40fcc961f3e', // WFLOW
  '0x7f27352d5f83db87a5a3e00f4b07cc2138d8ee52', // USDC.e (Celer)
]

const LABELS = {
  SWAP_FEES: 'Swap Fees',
  SWAP_FEES_TO_PROTOCOL: 'Swap Fees To Protocol',
  SWAP_FEES_TO_LPS: 'Swap Fees To LPs',
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({ eventAbi: SWAP_EVENT, noTarget: true, onlyArgs: false })
  const poolKeys = [...new Set(logs.map((log: any) => `${log.args.tokenX}-${log.args.tokenY}-${log.args.fee}`))]
  const factoryPools: string[] = await options.api.multiCall({
    target: FACTORY,
    abi: 'function pool(address, address, uint24) view returns (address)',
    calls: poolKeys.map((key) => ({ params: key.split('-') })),
  })
  const registered = new Set(factoryPools.map((pool) => pool.toLowerCase()))
  const pools = [...new Set(logs.map((log: any) => log.address.toLowerCase()))].filter((pool) => registered.has(pool))
  const feeChargePercents = await options.api.multiCall({ abi: 'uint24:feeChargePercent', calls: pools })
  const protocolShare: Record<string, number> = {}
  pools.forEach((pool, i) => { protocolShare[pool] = Number(feeChargePercents[i]) / 100 })

  for (const log of logs) {
    const pool = log.address.toLowerCase()
    if (protocolShare[pool] === undefined) continue
    const { tokenX, tokenY, fee, sellXEarnY, amountX, amountY } = log.args
    const [tokenIn, amountIn, tokenOut, amountOut] = sellXEarnY ? [tokenX, amountX, tokenY, amountY] : [tokenY, amountY, tokenX, amountX]
    const pricedLeg = [[tokenIn, amountIn], [tokenOut, amountOut]].find(([t]) => PRICED_TOKENS.includes(t.toLowerCase()))
    let token: string, amount: number
    if (pricedLeg) {
      [token, amount] = [pricedLeg[0], Number(pricedLeg[1])]
      dailyVolume.add(token, amount)
    } else {
      ({ token, amount } = addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokenIn, amount0: amountIn, token1: tokenOut, amount1: amountOut }))
    }
    const feeAmount = amount * Number(fee) / FEE_DENOMINATOR
    dailyFees.add(token, feeAmount, LABELS.SWAP_FEES)
    dailyRevenue.add(token, feeAmount * protocolShare[pool], LABELS.SWAP_FEES_TO_PROTOCOL)
    dailySupplySideRevenue.add(token, feeAmount * (1 - protocolShare[pool]), LABELS.SWAP_FEES_TO_LPS)
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.FLOW],
  start: '2024-09-23',
  deadFrom: '2026-07-27', // Trado announced its shutdown from 2026-07-27; only dust swaps after
  methodology: {
    Volume: 'Value of tokens swapped through Trado pools created by the Trado (iZiSwap) factory on Flow, counted on one side of each swap.',
    Fees: 'Swap fees paid by traders, charged at the pool fee tier on the input amount of each swap.',
    UserFees: 'Swap fees paid by traders, charged at the pool fee tier on the input amount of each swap.',
    Revenue: 'Share of swap fees kept by Trado, set per pool (50-51%). Limit-order fills pay their whole fee to the protocol, so this is a lower bound.',
    ProtocolRevenue: 'Share of swap fees sent to the Trado fee receiver, set per pool (50-51%). Limit-order fills pay their whole fee to the protocol, so this is a lower bound.',
    SupplySideRevenue: 'Share of swap fees paid to liquidity providers, the remainder after the protocol share of each pool.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.SWAP_FEES]: 'Swap fees paid by traders, charged at the pool fee tier on the input amount of each swap.',
    },
    UserFees: {
      [LABELS.SWAP_FEES]: 'Swap fees paid by traders, charged at the pool fee tier on the input amount of each swap.',
    },
    Revenue: {
      [LABELS.SWAP_FEES_TO_PROTOCOL]: 'Per-pool share of swap fees kept by Trado.',
    },
    ProtocolRevenue: {
      [LABELS.SWAP_FEES_TO_PROTOCOL]: 'Per-pool share of swap fees sent to the Trado fee receiver.',
    },
    SupplySideRevenue: {
      [LABELS.SWAP_FEES_TO_LPS]: 'Remaining share of swap fees paid to liquidity providers.',
    },
  },
}

export default adapter
