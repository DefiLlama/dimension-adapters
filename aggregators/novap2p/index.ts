import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchTransfersFromLifiAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";
const INTEGRATORS = ["novap2p"];

const chainConfig: Record<string, { diamond?: string; lifiChainId: number; start: string }> = {
  [CHAIN.ETHEREUM]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", lifiChainId: 1, start: "2026-10-01" },
  [CHAIN.BSC]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", lifiChainId: 56, start: "2026-10-01" },
  [CHAIN.POLYGON]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", lifiChainId: 137, start: "2026-10-01" },
  [CHAIN.ARBITRUM]: { diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", lifiChainId: 42161, start: "2026-10-01" },
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { diamond, lifiChainId } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  if (diamond) {
    const logs = await options.getLogs({
      target: diamond,
      eventAbi: LifiSwapEvent,
      maxBlockRange: 10000,
    });

    const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain);
    const blacklistSet = new Set(blacklistedTokens.map((t) => t.toLowerCase()));

    for (const log of logs) {
      if (!INTEGRATORS.includes(log.integrator)) continue;
      if (blacklistSet.has(log.fromAssetId.toLowerCase()) || blacklistSet.has(log.toAssetId.toLowerCase())) continue;
      dailyVolume.add(log.fromAssetId, log.fromAmount);
    }
  } else {
    const transfers = await fetchTransfersFromLifiAPI(options.startTimestamp, options.endTimestamp, INTEGRATORS);
    transfers.forEach((tx) => {
      if (tx.sending.chainId === lifiChainId || tx.receiving.chainId === lifiChainId) {
        dailyVolume.addUSDValue(Number(tx.sending.amountUSD || 0));
      }
    });
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
};

export default adapter;
  
