import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const FACTORY = '0xE29a6620DAc789B8a76e9b9eC8fE9B7cf2B663D5'

const SWAP_EVENT = 'event Swap(address indexed tokenX, address indexed tokenY, uint24 indexed fee, bool sellXEarnY, uint256 amountX, uint256 amountY, int24 currentPoint)'
const FEE_DENOMINATOR = 1e6

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

  // ~700 pools and no multicall contract on Merlin: pull Swap by topic, then keep only pools the factory registered for the logged (tokenX, tokenY, fee)
  const logs = await options.getLogs({ eventAbi: SWAP_EVENT, noTarget: true, onlyArgs: false })
  const poolKeys = [...new Set(logs.map((log: any) => `${log.args.tokenX}-${log.args.tokenY}-${log.args.fee}`))]
  const factoryPools: string[] = await options.api.multiCall({
    target: FACTORY,
    abi: 'function pool(address, address, uint24) view returns (address)',
    calls: poolKeys.map((key) => ({ params: key.split('-') })),
  })
  const pools = factoryPools.map((pool) => pool.toLowerCase())
  // percent of the LP fee kept by the protocol, set per pool (50-99 on Merlin, factory default 60)
  const feeChargePercents = await options.api.multiCall({ abi: 'uint24:feeChargePercent', calls: factoryPools })
  const protocolShare: Record<string, number> = {}
  pools.forEach((pool, i) => { protocolShare[pool] = Number(feeChargePercents[i]) / 100 })

  for (const log of logs) {
    const pool = log.address.toLowerCase()
    if (protocolShare[pool] === undefined) continue
    const { tokenX, tokenY, fee, sellXEarnY, amountX, amountY } = log.args
    const [tokenIn, amountIn, tokenOut, amountOut] = sellXEarnY ? [tokenX, amountX, tokenY, amountY] : [tokenY, amountY, tokenX, amountX]
    const { token, amount } = addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokenIn, amount0: amountIn, token1: tokenOut, amount1: amountOut })
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
  chains: [CHAIN.MERLIN],
  start: '2024-02-03',
  methodology: {
    Volume: 'Value of tokens swapped through MerlinSwap pools created by the MerlinSwap (iZiSwap) factory, counted on one side of each swap.',
    Fees: 'Swap fees paid by traders, charged at the pool fee tier on the input amount of each swap.',
    UserFees: 'Swap fees paid by traders, charged at the pool fee tier on the input amount of each swap.',
    Revenue: 'Share of swap fees kept by MerlinSwap, set per pool (mostly 50-60%). Limit-order fills pay their whole fee to the protocol, so this is a lower bound.',
    ProtocolRevenue: 'Share of swap fees sent to the MerlinSwap fee receiver, set per pool (mostly 50-60%). Limit-order fills pay their whole fee to the protocol, so this is a lower bound.',
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
      [LABELS.SWAP_FEES_TO_PROTOCOL]: 'Per-pool share of swap fees kept by MerlinSwap.',
    },
    ProtocolRevenue: {
      [LABELS.SWAP_FEES_TO_PROTOCOL]: 'Per-pool share of swap fees sent to the MerlinSwap fee receiver.',
    },
    SupplySideRevenue: {
      [LABELS.SWAP_FEES_TO_LPS]: 'Remaining share of swap fees paid to liquidity providers.',
    },
  },
}

export default adapter
