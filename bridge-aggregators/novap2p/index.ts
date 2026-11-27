import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

// Official LI.FI Diamond contract address deployed across EVM chains (https://li.fi)
const LIFI_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const LifiTransferEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)";
const INTEGRATORS = ["nova-p2p"];

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyBridgeVolume = options.createBalances();

  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain);
  const blacklistSet = new Set(blacklistedTokens.map((t) => t.toLowerCase()));

  const transferLogs = await options.getLogs({
    target: LIFI_DIAMOND,
    eventAbi: LifiTransferEvent,
    maxBlockRange: 10000,
  });

  for (const log of transferLogs) {
    const data = log.bridgeData;
    if (!INTEGRATORS.includes(data.integrator)) continue;
    if (blacklistSet.has(data.sendingAssetId.toLowerCase())) continue;
    dailyBridgeVolume.add(data.sendingAssetId, data.minAmount);
  }

  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.POLYGON, CHAIN.ARBITRUM],
  start: "2026-11-01",
};

export default adapter;
