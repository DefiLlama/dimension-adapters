import BigNumber from "bignumber.js";
import { Fetch, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';

// On-chain tokens
const TOKENS = {
    'vita-inu': {
        address: '0x00c1E515EA9579856304198EFb15f525A0bb50f6',
        decimals: 18
    },
    tether: {
        address: '0xC0264277fcCa5FCfabd41a8bC01c1FcAF8383E41',
        decimals: 6
    },
    ethereum: {
        address: '0xDd4b9b3Ce03faAbA4a3839c8B5023b7792be6e2C',
        decimals: 18
    },
    vinuchain: {
        address: '0xEd8c5530a0A086a12f57275728128a60DFf04230',
        decimals: 18
    }
}

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

const fetch = (async (timestamp: number, _: any, { getLogs, createBalances, chain, api }: FetchOptions): Promise<FetchResultVolume> => {
  // VinuSwap is based on a variant of Uniswap v3, but the uniswap v3 helper doesn't work here
  const dailyVolume = createBalances();

  const reverseTokenMapping = Object.fromEntries(
    Object.entries(TOKENS).map(([key, value]) => [value.address.toLowerCase(), key])
  )

  const poolCreationLogs = await getLogs({
      target: FACTORY,
      eventAbi: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address feeManager, address pool)',
      fromBlock: 5000
  })

  const pools = [...V1_POOLS, ...poolCreationLogs.map(log => log.pool)]

  const token0s = await api.multiCall({
    abi: 'address:token0',
    calls: pools
  })

  const token1s = await api.multiCall({
    abi: 'address:token1',
    calls: pools
  })

  const poolInfos = pools.map((pool, i) => ({
    pool,
    token0: token0s[i],
    token1: token1s[i],
  }))

  await Promise.all(poolInfos.map(async (poolInfos) => {
    const logs = await getLogs({
      targets: [poolInfos.pool],
      eventAbi: event_swap,
      fromBlock: 5000
    })

    logs.forEach(log => {
      const token0 = reverseTokenMapping[poolInfos.token0.toLowerCase()]
      const token1 = reverseTokenMapping[poolInfos.token1.toLowerCase()]

      const decimals0 = TOKENS[token0].decimals
      const decimals1 = TOKENS[token1].decimals

      dailyVolume.addCGToken(token0, BigNumber(log.amount0).div(`1e${decimals0}`).toNumber())
      dailyVolume.addCGToken(token1, BigNumber(log.amount1).div(`1e${decimals1}`).toNumber())
    })
  }))

  return { dailyVolume, timestamp };
}) as Fetch;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.VINUCHAIN]: { fetch, start: '2024-06-01' }
  }
};

export default adapter;
