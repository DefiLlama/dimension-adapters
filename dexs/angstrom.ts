import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

interface IUniswapConfig {
  poolManager: string;
  positionManager: string;
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
  const dailyVolume = options.createBalances()

  const config = Configs[options.chain];
  if (!config) {
    throw Error(`config not found for chain ${options.chain}`);
  }

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

    const pools: {[key: string]: IPool | null} = {}
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
        dailyFees.add(token, Math.abs(Number(event.amount0)) * (Number(event.fee) / 1e6))
        dailyVolume.add(token, Math.abs(Number(event.amount0)))
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  doublecounted: true,
  methodology: {
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    SupplySideRevenue: 'All fees are distributed to LPs.',
  },
  chains: Object.keys(Configs),
  start: '2025-07-23',
  fetch,
};

export default adapter;
