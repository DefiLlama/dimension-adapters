import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const event_swap = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';

// Deployed with an old contract
const V1_POOLS = [
  '0xa97FA6E9A764306107F2103a2024Cfe660c5dA33',
  '0x3424b0dd7715C8db92414DB0c5A9E5FA0D51cCb5',
  '0xfD763943f628e125CEE3D8d85DC0fc7098355d16',
  '0x8d713bC2d35327B536A8B2CCec9392e57C0D04B4',
  '0xd50ee26F62B1825d14e22e23747939D96746434c'
]

// v1.1 factory
const FACTORY = '0xd74dEe1C78D5C58FbdDe619b707fcFbAE50c3EEe'

const fetch = async ({ getLogs, createBalances, api, chain }: FetchOptions) => {
  // VinuSwap is based on a variant of Uniswap v3, but the uniswap v3 helper doesn't work here
  const dailyVolume = createBalances();

  const poolCreationLogs = await getLogs({
    target: FACTORY,
    eventAbi: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address feeManager, address pool)',
    fromBlock: 5000,
    cacheInCloud: true,
  })

  const pools = [...V1_POOLS, ...poolCreationLogs.map(log => log.pool)]

  const token0s = await api.multiCall({ abi: 'address:token0', calls: pools })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pools })


  await Promise.all(pools.map(async (pool, idx) => {
    const token0 = token0s[idx]
    const token1 = token1s[idx]
    const logs = await getLogs({ target: pool, eventAbi: event_swap, })

    logs.forEach(log => {
      addOneToken({ balances: dailyVolume, chain, token0, token1, amount0: log.amount0, amount1: log.amount1, });
    })
  }))

  return { dailyVolume, };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.VINUCHAIN]: { fetch, start: '2024-06-01' }
  }
};

export default adapter;
