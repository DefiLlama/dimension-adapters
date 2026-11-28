import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { decode_bundle } from '../../dexs/angstrom/helper/index'; // taken from https://github.com/SorellaLabs/angstrom-assembly-helper/tree/main

const POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90'
const ANGSTROM_HOOK = '0x0000000aa232009084Bd71A5797d089AA4Edfad4'
const HOOK_DEPLOY_BLOCK = 22971782
const EXECUTE_BUNDLE_SELECTOR = '0x09c5eabe'

const SwapEvent = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const InitializeEvent = 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)';

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()

  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: 'to',
    addresses: [ANGSTROM_HOOK],
    from_block: Number(await options.getFromBlock()),
    to_block: Number(options.toApi.block),
  })
  const bundleTxs = (transactions ?? []).filter((tx: any) => tx.input.startsWith(EXECUTE_BUNDLE_SELECTOR))
  for (const tx of bundleTxs) {
    const bundle = decode_bundle(tx.input)
    for (const poolUpdate of bundle.pool_updates) {
      const pair = bundle.pairs.get(poolUpdate.pair_index)
      const asset = pair && bundle.assets.get(pair.index0)
      if (!asset) continue
      const { rewards_update } = poolUpdate
      const auctionFee = rewards_update.isMultiTick
        ? rewards_update.quantities.reduce((sum: bigint, q: string) => sum + BigInt(q), 0n)
        : BigInt(rewards_update.amount || '0')
      if (auctionFee > 0n) dailyFees.add(asset.addr, auctionFee, 'Auction Fees')
    }
  }

  const initLogs = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: InitializeEvent,
    fromBlock: HOOK_DEPLOY_BLOCK,
    toBlock: Number(options.toApi.block),
  })
  const poolToken0: Record<string, string> = {}
  for (const log of initLogs) {
    if (String(log.hooks).toLowerCase() === ANGSTROM_HOOK.toLowerCase()) poolToken0[String(log.id)] = String(log.currency0)
  }

  const swaps = await options.getLogs({ target: POOL_MANAGER, eventAbi: SwapEvent })
  for (const swap of swaps) {
    const token0 = poolToken0[String(swap.id)]
    if (token0) dailyUserFees.add(token0, Math.abs(Number(swap.amount0)) * (Number(swap.fee) / 1e6))
  }
  dailyFees.add(dailyUserFees, 'Swap Fees')

  return {
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue: dailyFees.clone(),
    dailyRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Swap fees paid by users on Angstrom-hooked Uniswap v4 pools, plus block auction fees paid by arbitrageurs for the right to execute Angstrom bundles.',
    UserFees: 'Swap fees paid by users on each trade.',
    SupplySideRevenue: 'All swap fees and block auction fees go to LPs.',
    Revenue: 'Angstrom keeps no fees.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Swap fees paid by users on each trade.',
      'Auction Fees': 'Fees paid by arbitrageurs who win the right to extract MEV from Angstrom bundles, distributed to LPs.',
    },
    SupplySideRevenue: {
      'Swap Fees': 'Swap fees paid by users on each trade, kept by LPs.',
      'Auction Fees': 'Fees paid by arbitrageurs who win the right to extract MEV from Angstrom bundles, distributed to LPs.',
    },
  },
  chains: [CHAIN.ETHEREUM],
  start: '2025-07-23',
  fetch,
  // doublecounted: true,  // most of the fee come from the block auction
};

export default adapter;
