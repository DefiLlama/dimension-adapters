import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// AutoRange — non-custodial Uniswap V3 concentrated-liquidity vault
// platform. "Volume" here is NOT third-party swap volume routed through
// AutoRange (it doesn't route trades for anyone) — it's the USD value the
// keeper agent itself deploys into a fresh Uniswap V3 position every time
// it builds or rebuilds one: initPosition() (a vault's very first mint) and
// rebalance() (every subsequent re-mint after the price leaves the range or
// on the owner's configured interval). See RangeVault.sol's PositionInitialized
// and Rebalanced events.
const config: Record<string, { factory: string; positionManager: string; start: string }> = {
  [CHAIN.CELO]: {
    factory: "0xa431a0bD0978d872C720cD3E3277e31cd6026e90",
    positionManager: "0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A",
    start: "2026-07-16",
  },
  [CHAIN.ARBITRUM]: {
    factory: "0x93590F9a18Ed444dD90ECBeCA094aa9367452472",
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    start: "2026-07-18",
  },
};

const positionInitAbi = "event PositionInitialized(uint256 tokenId, uint256 amount0, uint256 amount1)";
// Rebalanced doesn't carry the new position's amount0/amount1 directly —
// cross-referenced below against the shared NonfungiblePositionManager's own
// IncreaseLiquidity event (emitted in the same transaction on every mint).
const rebalancedAbi = "event Rebalanced(uint256 indexed newTokenId, int24 tickLower, int24 tickUpper, uint256 reinjectedAmount)";
const increaseLiquidityAbi = "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)";

const fetch = async (options: FetchOptions) => {
  const { factory, positionManager } = config[options.chain];
  const dailyVolume = options.createBalances();

  const vaults: string[] = await options.api.fetchList({ target: factory, lengthAbi: "vaultCount", itemAbi: "allVaults" });
  if (!vaults.length) return { dailyVolume };

  const [token0s, token1s] = await Promise.all([
    options.api.multiCall({ calls: vaults, abi: "address:token0" }),
    options.api.multiCall({ calls: vaults, abi: "address:token1" }),
  ]);

  const [positionInitLogs, rebalancedLogs] = await Promise.all([
    options.getLogs({ targets: vaults, eventAbi: positionInitAbi, flatten: false }),
    options.getLogs({ targets: vaults, eventAbi: rebalancedAbi, flatten: false, onlyArgs: false }),
  ]);

  vaults.forEach((_, i) => {
    (positionInitLogs[i] ?? []).forEach((log: any) => {
      dailyVolume.add(token0s[i], log.amount0);
      dailyVolume.add(token1s[i], log.amount1);
    });
  });

  const anyRebalances = rebalancedLogs.some((logs: any[]) => logs?.length);
  if (anyRebalances) {
    const increaseLogs = await options.getLogs({ target: positionManager, eventAbi: increaseLiquidityAbi, onlyArgs: false });

    const byTokenId = new Map<string, any[]>();
    (increaseLogs ?? []).forEach((log: any) => {
      const key = String(log.args.tokenId);
      const existing = byTokenId.get(key);
      if (existing) existing.push(log);
      else byTokenId.set(key, [log]);
    });

    vaults.forEach((_, i) => {
      (rebalancedLogs[i] ?? []).forEach((log: any) => {
        const matches = (byTokenId.get(String(log.args.newTokenId)) ?? []).filter(
          (m: any) => m.transactionHash === log.transactionHash,
        );
        if (!matches.length) return;
        matches.forEach((match) => {
          dailyVolume.add(token0s[i], match.args.amount0);
          dailyVolume.add(token1s[i], match.args.amount1);
        });
      });
    });
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "USD value deployed by AutoRange's keeper agent every time it builds or rebuilds a vault's Uniswap V3 position (initial mint or rebalance) — not third-party swap volume, since AutoRange doesn't route trades for anyone else.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology,
};

export default adapter;
