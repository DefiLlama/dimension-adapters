import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

const LifiTransferEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)";
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

  const transferLogs = await options.getLogs({
    target: diamond,
    eventAbi: LifiTransferEvent,
    maxBlockRange: 10000,
  });

  for (const log of transferLogs) {
    const data = log.bridgeData;
    if (!INTEGRATORS.includes(data.integrator)) continue;
    if (!data.hasSourceSwaps) continue;
    if (blacklistSet.has(data.sendingAssetId.toLowerCase())) continue;
    dailyVolume.add(data.sendingAssetId, data.minAmount);
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
  
