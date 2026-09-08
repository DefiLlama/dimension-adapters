import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, LIFI_API_CHAINS, fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted, getDefaultDexTokensWhitelisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const integrators = ['jumper.exchange', 'transferto.xyz', 'jumper.exchange.gas', 'lifi-gasless-jumper']

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (LIFI_API_CHAINS.includes(options.chain as CHAIN)) {
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, integrators, [], 'same-chain');
    return { dailyVolume } as any;
  }

  const dailyVolume = options.createBalances();
  let logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537',
    eventAbi: LifiSwapEvent,
    maxBlockRange: 10000, // chunk the RPC-fallback range so chains not on the indexer (e.g. cronos) don't blow the eth_getLogs limit over a full day
  });

  // count volume only from whitelisted tokens (same filter as the LI.FI dex adapter)
  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
  const whitelistedTokens = await getDefaultDexTokensWhitelisted({ chain: options.chain })
  if (whitelistedTokens.length > 0) {
    logs = logs.filter(log => (whitelistedTokens.includes(formatAddress(log.fromAssetId)) || whitelistedTokens.includes(formatAddress(log.toAssetId)))
      && !blacklistedTokens.includes(formatAddress(log.fromAssetId))
      && !blacklistedTokens.includes(formatAddress(log.toAssetId))
    )
  } else if (blacklistedTokens.length > 0) {
    logs = logs.filter(log => !blacklistedTokens.includes(formatAddress(log.fromAssetId)) && !blacklistedTokens.includes(formatAddress(log.toAssetId)))
  }

  logs.forEach((log: any) => {
    if (integrators.includes(log.integrator)) {
      dailyVolume.add(log.toAssetId, log.toAmount);
    }
  });

  return { dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(LifiDiamonds).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: LifiDiamonds[chain].start, }
    }
  }, {})
};

export default adapter;
