import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";
const INTEGRATORS = ["nova-p2p"];

const chainConfig: Record<string, { diamond: string; start: string }> = {
  [CHAIN.ETHEREUM]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", start: "2026-11-01" },
  [CHAIN.BSC]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", start: "2026-11-01" },
  [CHAIN.POLYGON]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", start: "2026-11-01" },
  [CHAIN.ARBITRUM]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", start: "2026-11-01" },
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { diamond } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain);
  const blacklistSet = new Set(blacklistedTokens.map((t) => t.toLowerCase()));

  const swapLogs = await options.getLogs({
    target: diamond,
    eventAbi: LifiSwapEvent,
    maxBlockRange: 10000,
  });

  for (const log of swapLogs) {
    if (!INTEGRATORS.includes(log.integrator)) continue;
    if (blacklistSet.has(log.fromAssetId.toLowerCase()) || blacklistSet.has(log.toAssetId.toLowerCase())) continue;
    dailyVolume.add(log.fromAssetId, log.fromAmount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
};

export default adapter;
