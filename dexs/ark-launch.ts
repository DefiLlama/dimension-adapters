// ARK Launch (https://ark-ai.xyz) — token launchpad on Arc. Spot volume of every launched token: each launch seeds one
// Uniswap V3 USDC pool (1% fee, LP locked forever), so volume = the USDC leg of every Swap on those pools. Pools are
// enumerated from the TokenLaunched events of both LaunchFactory generations (cached).
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const USDC = "0x3600000000000000000000000000000000000000"; // Arc native USDC ERC-20 interface, 6 decimals

const FACTORIES = [
  { address: "0x3d0B83e115205EDf37e48A8EB6d92e2C7492A00C", fromBlock: 21117455 }, // gen1
  { address: "0x9B9A136d04E8E19a934de062F0FBB929b3C7AEdb", fromBlock: 21170619 }, // gen2
];
const TOKEN_LAUNCHED = "event TokenLaunched(address indexed token, address indexed deployer, address indexed pool, uint256 positionId, bool isToken0, uint256 restrictionsEndBlock, uint256 graduationThreshold, uint256 initialBuyUsdc, uint256 creationFeePaid)";
const SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const pools: string[] = [];
  const usdcIsToken0 = new Map<string, boolean>();
  for (const f of FACTORIES) {
    const launches = await options.getLogs({ target: f.address, eventAbi: TOKEN_LAUNCHED, fromBlock: f.fromBlock, cacheInCloud: true });
    for (const l of launches) {
      const pool = String(l.pool).toLowerCase();
      pools.push(pool);
      usdcIsToken0.set(pool, !l.isToken0); // isToken0 refers to the launched token
    }
  }
  if (!pools.length) return { dailyVolume };

  // flatten: false → one array of parsed logs per target, in `pools` order
  const perPool: any[][] = await options.getLogs({ targets: pools, eventAbi: SWAP, flatten: false });
  perPool.forEach((swaps, i) => {
    const usdcFirst = usdcIsToken0.get(pools[i]);
    for (const log of swaps) {
      const amt = BigInt((usdcFirst ? log.amount0 : log.amount1).toString());
      dailyVolume.add(USDC, amt < 0n ? -amt : amt);
    }
  });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Volume: "USDC leg of every Uniswap V3 swap on the pools created by ARK Launch (one USDC pool per launched token, LP locked in the FeeLocker).",
  },
};

export default adapter;
