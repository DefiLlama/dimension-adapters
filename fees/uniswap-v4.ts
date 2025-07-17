import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

interface IUniswapConfig {
  poolManager: string;
  positionManager: string;
  start: string;
}

interface IPool {
  poolId: string;
  poolKey: string;
  currency0: string;
  currency1: string;
}

const Configs: Record<string, IUniswapConfig> = {
  [CHAIN.ETHEREUM]: {
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    positionManager: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
    start: '2025-01-24',
  },
  [CHAIN.UNICHAIN]: {
    poolManager: '0x1f98400000000000000000000000000000000004',
    positionManager: '0x4529a01c7a0410167c5740c487a8de60232617bf',
    start: '2025-01-24',
  },
  [CHAIN.OPTIMISM]: {
    poolManager: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
    positionManager: '0x3c3ea4b57a46241e54610e5f022e5c45859a1017',
    start: '2025-01-24',
  },
  [CHAIN.BASE]: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
    start: '2025-01-24',
  },
  [CHAIN.ARBITRUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    positionManager: '0xd88f38f930b7952f2db2432cb002e7abbf3dd869',
    start: '2025-01-24',
  },
  [CHAIN.POLYGON]: {
    poolManager: '0x67366782805870060151383f4bbff9dab53e5cd6',
    positionManager: '0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9',
    start: '2025-01-24',
  },
  [CHAIN.BLAST]: {
    poolManager: '0x1631559198a9e474033433b2958dabc135ab6446',
    positionManager: '0x4ad2f4cca2682cbb5b950d660dd458a1d3f1baad',
    start: '2025-01-24',
  },
  [CHAIN.ZORA]: {
    poolManager: '0x0575338e4c17006ae181b47900a84404247ca30f',
    positionManager: '0xf66c7b99e2040f0d9b326b3b7c152e9663543d63',
    start: '2025-01-24',
  },
  [CHAIN.WC]: {
    poolManager: '0xb1860d529182ac3bc1f51fa2abd56662b7d13f33',
    positionManager: '0xc585e0f504613b5fbf874f21af14c65260fb41fa',
    start: '2025-01-24',
  },
  [CHAIN.INK]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    positionManager: '0x1b35d13a2e2528f192637f14b05f0dc0e7deb566',
    start: '2025-01-29',
  },
  [CHAIN.SONEIUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    positionManager: '0x1b35d13a2e2528f192637f14b05f0dc0e7deb566',
    start: '2025-01-29',
  },
  [CHAIN.AVAX]: {
    poolManager: '0x06380c0e0912312b5150364b9dc4542ba0dbbc85',
    positionManager: '0xb74b1f14d2754acfcbbe1a221023a5cf50ab8acd',
    start: '2025-01-24',
  },
  [CHAIN.BSC]: {
    poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
    positionManager: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
    start: '2025-01-24',
  },
}

function getPoolKey(poolId: string): string {
  return poolId.slice(0, 52);
}

async function fetch(options: FetchOptions) {
  const events = await options.getLogs({
    target: Configs[options.chain].poolManager,
    eventAbi: 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  });

  const pools: {[key: string]: IPool | null} = {}
  for (const event of events) {
    pools[event.id] = null
  }

  // query pools info
  const poolIds = Object.keys(pools)
  const poolKeys = await options.api.multiCall({
    abi: 'function poolKeys(bytes25) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)',
    calls: poolIds.map(poolId => {
      return {
        target: Configs[options.chain].positionManager,
        params: [getPoolKey(poolId)],
      }
    })
  })

  for (let i = 0; i < poolIds.length; i++) {
    pools[poolIds[i]] = {
      poolId: poolIds[i],
      poolKey: getPoolKey(poolIds[i]),
      currency0: String(poolKeys[i].currency0),
      currency1: String(poolKeys[i].currency1),
    }
  }

  const dailyFees = options.createBalances()
  for (const event of events) {
    const poolId = String(event.id)
    const token = (pools[poolId] as IPool).currency0
    if (token === '0x0000000000000000000000000000000000000000') {
      dailyFees.addGasToken(Number(event.amount0) * Number(event.fee) / 1e6)
    } else {
      dailyFees.add(token, Number(event.amount0) * Number(event.fee) / 1e6)
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    
  },
};

const meta = {
  methodology: {
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    Revenue: 'Protocol make no revenue.',
    ProtocolRevenue: 'Protocol make no revenue.',
    SupplySideRevenue: 'All fees are distributed to LPs.',
    HoldersRevenue: 'No revenue for UNI holders.',
  }
}

for (const [chain, config] of Object.entries(Configs)) {
  adapter.adapter[chain] = {
    fetch,
    meta,
    start: config.start,
  }
}

export default adapter;
