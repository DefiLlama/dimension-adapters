import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

// Official LI.FI Diamond contract address deployed across EVM chains (https://li.fi)
const LIFI_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";
const INTEGRATORS = ["nova-p2p"];

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain);
  const blacklistSet = new Set(blacklistedTokens.map((t) => t.toLowerCase()));

  const swapLogs = await options.getLogs({
    target: LIFI_DIAMOND,
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
  chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.POLYGON, CHAIN.ARBITRUM],
  start: "2026-11-01",
};

export default adapter;
