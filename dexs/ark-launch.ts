// ARK Launch (https://ark-ai.xyz): token launchpad on Arc. Each launch seeds one 1% Uniswap V3 USDC pool (LP locked),
// so volume = the USDC leg of every Swap on those pools. Pools are enumerated from TokenLaunched on both factory
// generations. Gen2 pools live on the official Uniswap V3 factory already tracked by dexs/uniswap-v3 on Arc, hence
// doublecounted.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const USDC = "0x3600000000000000000000000000000000000000"; // Arc native USDC ERC-20 interface, 6 decimals

const FACTORIES = [
  { address: "0x3d0B83e115205EDf37e48A8EB6d92e2C7492A00C", fromBlock: 21117455 }, // gen1, own V3 fork
  { address: "0x9B9A136d04E8E19a934de062F0FBB929b3C7AEdb", fromBlock: 21170619 }, // gen2, official Uniswap V3 factory
];
const TOKEN_LAUNCHED = "event TokenLaunched(address indexed token, address indexed deployer, address indexed pool, uint256 positionId, bool isToken0, uint256 restrictionsEndBlock, uint256 graduationThreshold, uint256 initialBuyUsdc, uint256 creationFeePaid)";
const SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const usdcIsToken0: Record<string, boolean> = {};
  for (const f of FACTORIES) {
    const launches = await options.getLogs({ target: f.address, eventAbi: TOKEN_LAUNCHED, fromBlock: f.fromBlock, cacheInCloud: true });
    for (const l of launches) usdcIsToken0[l.pool.toLowerCase()] = !l.isToken0; // isToken0 refers to the launched token
  }
  const pools = Object.keys(usdcIsToken0);
  if (!pools.length) return { dailyVolume };

  const swaps = await options.getLogs({ targets: pools, eventAbi: SWAP, onlyArgs: false });
  for (const log of swaps) {
    const amt = BigInt(usdcIsToken0[log.address.toLowerCase()] ? log.args.amount0 : log.args.amount1);
    dailyVolume.add(USDC, amt < 0n ? -amt : amt);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Volume: "USDC side of every swap on the Uniswap V3 pools created by ARK Launch, one pool per launched token.",
  },
};

export default adapter;
