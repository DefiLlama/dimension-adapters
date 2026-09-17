import * as sdk from "@defillama/sdk";
import { AbiCoder, keccak256 } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// aka.fun launches trade on Arc's shared canonical Uniswap v4 PoolManager, so Swap
// events must be scoped to just aka.fun's own pools. Every launch pairs the token
// against the native gas token with a fixed PoolKey (fee 0, tickSpacing 1, hooked
// by AkaFunHook), so the pool id is derived rather than discovered - verified against
// 230 sampled launches' real PoolManager Initialize events.
const AKA_FUN_LAUNCHER = "0x7898Dd4bD730677ea0cBe6eEcEB2545D6a262b7B";
const AKA_FUN_HOOK = "0x61d3117023D827f4851e88a7CAD5C7bD49e4C4Cc";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const LAUNCHER_DEPLOY_BLOCK = 21070272;

// AkaFunLauncher is unverified; matched by raw topic (name unrecoverable from the
// hash). Data's second word (bytes 32:64) is the launched token address.
const TOKEN_LAUNCHED_TOPIC = "0xa9fc9b5710ab8a55a5e47ba49232d56293e87011dbb124d337ef1af3334788d3";
const SWAP_EVENT = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const abiCoder = AbiCoder.defaultAbiCoder();

// Uniswap v4's PoolKey.toId() formula: keccak256 of the abi-encoded
// (currency0, currency1, fee, tickSpacing, hooks) tuple.
function poolIdFor(token: string): string {
  const encoded = abiCoder.encode(
    ["address", "address", "uint24", "int24", "address"],
    [ADDRESSES.null, token, 0, 1, AKA_FUN_HOOK],
  );
  return keccak256(encoded).toLowerCase();
}

// The shared PoolManager is too log-dense chain-wide for a plain address+eventAbi
// scan (RPC "exceeds max results"), so swaps are filtered server-side by OR-ing
// aka.fun's known pool ids into the indexed `id` topic.
const MAX_BLOCK_RANGE = 9000;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const launchLogs = await sdk.getEventLogs({
    chain: options.chain,
    target: AKA_FUN_LAUNCHER,
    topic: TOKEN_LAUNCHED_TOPIC,
    fromBlock: LAUNCHER_DEPLOY_BLOCK,
    toBlock: Number(options.toApi.block),
    entireLog: true,
    cacheInCloud: true,
    maxBlockRange: MAX_BLOCK_RANGE,
  });

  const akaPoolIds: string[] = [];
  for (const log of launchLogs) {
    const token = "0x" + log.data.slice(2).slice(64, 128).slice(24);
    akaPoolIds.push(poolIdFor(token));
  }
  if (!akaPoolIds.length) return { dailyVolume };

  const swaps = await sdk.getEventLogs({
    chain: options.chain,
    target: POOL_MANAGER,
    eventAbi: SWAP_EVENT,
    topics: [SWAP_TOPIC, akaPoolIds] as any, // OR-match: id (topics[1]) in aka.fun's pool set
    fromBlock: Number(options.fromApi.block),
    toBlock: Number(options.toApi.block),
    maxBlockRange: MAX_BLOCK_RANGE,
    onlyArgs: true,
  });
  for (const swap of swaps) {
    // currency0 is always the native gas token in aka.fun's pools (see PoolKey above).
    dailyVolume.add(ADDRESSES.null, Math.abs(Number(swap.amount0)));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Volume: "Swap volume on aka.fun's launched-token pools, priced off the native (18-decimal) gas token side of every trade.",
  },
};

export default adapter;
