import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { decode_bundle } from './helper/index'; // taken from https://github.com/SorellaLabs/angstrom-assembly-helper/tree/main

interface IUniswapConfig {
  poolManager: string;
  hook: string;
  source: 'LOGS';
  start: string;
  startBlock: number;
}

interface IPool {
  poolId: string;
  currency0: string;
  currency1: string;
}

const SwapEvent = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const InitializeEvent = 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)';

const Configs: Record<string, IUniswapConfig> = {
  [CHAIN.ETHEREUM]: {
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    hook: '0x0000000aa232009084Bd71A5797d089AA4Edfad4',
    source: 'LOGS',
    start: '2025-07-23',
    startBlock: 22971782, // Angstrom hook deployment block
  },
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyVolume = options.createBalances()

  const config = Configs[options.chain];

  if (!config) {
    throw Error(`config not found for chain ${options.chain}`);
  }

  // --- Block auction fees from Angstrom bundles ---
  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: 'to',
    addresses: [config.hook],
    from_block: Number(options.fromApi.block),
    to_block: Number(options.toApi.block),
  })

  if (transactions) {
    const bundleTxns = transactions.filter((tx: any) => tx.input.startsWith('0x09c5eabe'))
    for (const tx of bundleTxns) {
      const bundle = decode_bundle(tx.input)
      for (const poolUpdate of bundle.pool_updates) {
        const pair = bundle.pairs.get(poolUpdate.pair_index)
        if (!pair) continue
        const asset = bundle.assets.get(pair.index0)
        if (!asset) continue
        const token0 = asset.addr

        let feeAmount: bigint
        if (poolUpdate.rewards_update.isMultiTick) {
          feeAmount = poolUpdate.rewards_update.quantities.reduce((sum: bigint, q: string) => sum + BigInt(q), 0n)
        } else {
          feeAmount = BigInt(poolUpdate.rewards_update.amount || '0')
        }

        if (feeAmount > 0n) {
          dailyFees.add(token0, feeAmount, 'Auction Fees')
        }
      }
    }
  }

  // --- User swap fees from Uniswap v4 pool manager logs ---
  if (config.source === 'LOGS') {
    const initLogs = await options.getLogs({
      target: config.poolManager,
      eventAbi: InitializeEvent,
      fromBlock: config.startBlock,
      toBlock: Number(options.toApi.block),
    });

    const pools: { [poolId: string]: IPool } = {}
    for (const log of initLogs) {
      if (String(log.hooks).toLowerCase() !== config.hook.toLowerCase()) continue
      const poolId = String(log.id)
      pools[poolId] = {
        poolId,
        currency0: String(log.currency0),
        currency1: String(log.currency1),
      }
    }

    const events = await options.getLogs({
      target: config.poolManager,
      eventAbi: SwapEvent,
    });

    for (const event of events) {
      const pool = pools[String(event.id)]
      if (!pool) continue
      const token = pool.currency0
      dailyUserFees.add(token, Math.abs(Number(event.amount0)) * (Number(event.fee) / 1e6))
      dailyVolume.add(token, Math.abs(Number(event.amount0)))
    }
  }

  dailyFees.add(dailyUserFees, 'Swap Fees')

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0, // all fees to LPs
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // doublecounted: true,  // most of the fee come from the block auction
  methodology: {
    Volume: 'Swap volume across all Angstrom-hooked Uniswap v4 pools, measured as the token0 amount of each swap.',
    Fees: 'Includes user swap fees from Uniswap v4 pool swaps and block auction fees from Angstrom bundles distributed to LPs.',
    UserFees: 'Swap fees paid by users on each trade.',
    SupplySideRevenue: 'All fees (swap fees + block auction rewards) are distributed to LPs.',
    Revenue: 'No revenue collected by Angstrom',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Fee paid by the users on each swap',
      'Auction Fees': 'Fees paid by the arbitrageurs who win the right to extract MEV from Angstrom bundles. These fees are distributed to LPs.',
    },
    SupplySideRevenue: {
      'Swap Fees': 'Fee paid by the users on each swap',
      'Auction Fees': 'Fees paid by the arbitrageurs who win the right to extract MEV from Angstrom bundles. These fees are distributed to LPs.',
    },
  },
  chains: Object.keys(Configs),
  start: '2025-07-23',
  fetch,
};

export default adapter;
