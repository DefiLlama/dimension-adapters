// Foci — token launchpad on Arc (chain id 5042). Contracts: https://github.com/yonzaynator/foci
export const FACTORY = "0xa392D6eca5242715517eeCd43406aeD19424FAC0"; // FociLaunchFactory
export const FEE_ESCROW = "0x5a76a44B49ca0f7c4dB181f289C1eCA91d928406"; // FociFeeEscrow
export const MEME_HOOK = "0xF847790B6fA5DA300BB3f56f10d743e71E98e044"; // FociMemeHook (V4 hook)
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap V4 PoolManager on Arc
export const REWARDS_FACTORY = "0xdac447110867954F00638125bbd5c66D8E0a7195"; // FociRewardsDistributorFactory
// Arc's USDC as the 6-decimal ERC-20 view token; every Foci launch is quoted in it.
export const USDC = "0x3600000000000000000000000000000000000000";
export const FACTORY_START_BLOCK = 20883999; // 2026-09-14
export const REWARDS_FACTORY_START_BLOCK = 21075146; // 2026-09-15
export const START = "2026-09-14";

// Arc's public RPC endpoints refuse a log query of 10,000 blocks or more ("requested range too
// large") and answer 429 past ~2 requests/second, so every scan walks 5,000-block windows with a
// pause between them and backs off on failure. Windows are cached in cloud, so only the first run pays.
export const LOG_WINDOW = 5_000;
export const LOG_PAUSE_MS = 800;

export const ABI = {
  tokenLaunched:
    "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
  protocolFeeRecipient: "address:protocolFeeRecipient",
  getLaunchedToken:
    "function getLaunchedToken(address) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))",
  creditedToken: "event CreditedToken(address indexed recipient, address indexed token, address indexed depositor, uint256 amount)",
  referralFeeClaimed: "event ReferralFeeClaimed(address indexed referrer, address indexed currency, uint256 amount)",
  distributorDeployed:
    "event DistributorDeployed(address indexed token, address indexed distributor, address indexed creator, address pairToken, bytes32 salt)",
  curveBuy: "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  curveSell: "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
  swap: "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
};

import { getEventLogs } from "@defillama/sdk";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Paced, retried log scan over [fromBlock, toBlock]; returns parsed args (onlyArgs) of every log. */
export async function scanLogs(p: {
  chain: string; target?: string; targets?: string[]; eventAbi: string; topics?: string[]; fromBlock: number; toBlock: number; cacheInCloud?: boolean;
}): Promise<any[]> {
  const out: any[] = [];
  for (let from = p.fromBlock; from <= p.toBlock; from += LOG_WINDOW) {
    const to = Math.min(from + LOG_WINDOW - 1, p.toBlock);
    for (let attempt = 1; ; attempt++) {
      try {
        const logs = await getEventLogs({
          chain: p.chain, target: p.target, targets: p.targets, eventAbi: p.eventAbi, topics: p.topics,
          fromBlock: from, toBlock: to, onlyArgs: true, flatten: true, cacheInCloud: p.cacheInCloud ?? false,
        } as any);
        out.push(...logs);
        break;
      } catch (e) {
        if (attempt >= 6) throw e;
        await sleep(5_000 * attempt);
      }
    }
    if (to < p.toBlock) await sleep(LOG_PAUSE_MS);
  }
  return out;
}

/** Uniswap V4 pool id of a Foci pool: keccak256(abi.encode(currency0, currency1, fee=0, tickSpacing, hooks)). */
export function fociPoolId(memecoin: string, quote: string, tickSpacing: number, hooks: string): { poolId: string; quoteIsCurrency0: boolean } {
  const { AbiCoder, keccak256 } = require("ethers");
  const quoteIsCurrency0 = BigInt(quote) < BigInt(memecoin);
  const [c0, c1] = quoteIsCurrency0 ? [quote, memecoin] : [memecoin, quote];
  const encoded = new AbiCoder().encode(["address", "address", "uint24", "int24", "address"], [c0, c1, 0, tickSpacing, hooks]);
  return { poolId: keccak256(encoded).toLowerCase(), quoteIsCurrency0 };
}
