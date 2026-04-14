import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { decode_bundle } from './helper/index'; // taken from https://github.com/SorellaLabs/angstrom-assembly-helper/tree/main

interface IUniswapConfig {
  poolManager: string;
  positionManager: string;
  hook: string;
  source: 'LOGS';
  start: string;
  poolIds: Array<string>;
}

interface IPool {
  poolId: string;
  poolKey: string;
  currency0: string;
  currency1: string;
}

const SwapEvent = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const FunctionPoolKeys = 'function poolKeys(bytes25) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)';

const Configs: Record<string, IUniswapConfig> = {
  [CHAIN.ETHEREUM]: {
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    positionManager: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
    hook: '0x0000000aa232009084Bd71A5797d089AA4Edfad4',
    source: 'LOGS',
    start: '2025-07-23',
    poolIds: [
      '0xe500210c7ea6bfd9f69dce044b09ef384ec2b34832f132baec3b418208e3a657',
      '0x90078845bceb849b171873cfbc92db8540e9c803ff57d9d21b1215ec158e79b3',
    ],
  },
}

function getPoolKey(poolId: string): string {
  return poolId.slice(0, 52);
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
    const events = await options.getLogs({
      target: config.poolManager,
      eventAbi: SwapEvent,
    });

    // query pools info
    const poolKeys = await options.api.multiCall({
      abi: FunctionPoolKeys,
      target: config.positionManager,
      calls: config.poolIds.map(poolId => {
        return {
          params: [getPoolKey(poolId)],
        }
      }),
      permitFailure: true,
    })

    const pools: { [key: string]: IPool | null } = {}
    for (let i = 0; i < config.poolIds.length; i++) {
      if (poolKeys[i] && (poolKeys[i].currency0 !== ADDRESSES.null || poolKeys[i].currency1 !== ADDRESSES.null)) {
        pools[config.poolIds[i]] = {
          poolId: config.poolIds[i],
          poolKey: getPoolKey(config.poolIds[i]),
          currency0: String(poolKeys[i].currency0),
          currency1: String(poolKeys[i].currency1),
        }
      }
    }

    for (const event of events) {
      const poolId = String(event.id)
      if (pools[poolId] as IPool) {
        const token = (pools[poolId] as IPool).currency0
        dailyUserFees.add(token, Math.abs(Number(event.amount0)) * (Number(event.fee) / 1e6))
        dailyVolume.add(token, Math.abs(Number(event.amount0)))
      }
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
