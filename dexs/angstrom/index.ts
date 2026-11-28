import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90'
const ANGSTROM_HOOK = '0x0000000aa232009084Bd71A5797d089AA4Edfad4'
const HOOK_DEPLOY_BLOCK = 22971782

const SwapEvent = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const InitializeEvent = 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)';

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()

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
    if (token0) dailyVolume.add(token0, Math.abs(Number(swap.amount0)))
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // Angstrom pools are Uniswap v4 pools, already counted in uniswap-v4
  methodology: {
    Volume: 'Swap volume across all Angstrom-hooked Uniswap v4 pools, measured as the token0 amount of each swap.',
  },
  chains: [CHAIN.ETHEREUM],
  start: '2025-07-23',
  fetch,
};

export default adapter;
