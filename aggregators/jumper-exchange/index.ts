import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, LIFI_API_CHAINS, fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted, getDefaultDexTokensWhitelisted } from "../../helpers/lists";
import { isCoreAsset } from "../../helpers/prices";
import { nullAddress } from "../../helpers/token";
import { formatAddress } from "../../utils/utils";

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const NATIVE = nullAddress
const integrators = ['jumper.exchange', 'transferto.xyz', 'jumper.exchange.gas', 'lifi-gasless-jumper']

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (LIFI_API_CHAINS.includes(options.chain as CHAIN)) {
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, integrators, [], 'same-chain');
    return { dailyVolume } as any;
  }

  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537',
    eventAbi: LifiSwapEvent,
    maxBlockRange: 10000, // chunk the RPC-fallback range so chains not on the indexer (e.g. cronos) don't blow the eth_getLogs limit over a full day
  });

  // same token rules as the LI.FI dex adapter
  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
  const whitelistedTokens = await getDefaultDexTokensWhitelisted({ chain: options.chain })

  logs.forEach((log: any) => {
    if (!integrators.includes(log.integrator)) return;
    const fromAsset = formatAddress(log.fromAssetId)
    const toAsset = formatAddress(log.toAssetId)
    if (blacklistedTokens.includes(fromAsset) || blacklistedTokens.includes(toAsset)) return;

    if (whitelistedTokens.length === 0 || whitelistedTokens.includes(fromAsset) || whitelistedTokens.includes(toAsset)) {
      dailyVolume.add(log.toAssetId, log.toAmount);
      return;
    }

    // neither token listed: value on the core-asset side, never on native in (caller-declared amount)
    if (toAsset === NATIVE || isCoreAsset(options.chain, toAsset)) {
      dailyVolume.add(log.toAssetId, log.toAmount);
    } else if (fromAsset !== NATIVE && isCoreAsset(options.chain, fromAsset)) {
      dailyVolume.add(log.fromAssetId, log.fromAmount);
    }
  });

  return { dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  doublecounted: true, // Jumper volume is also included in the LI.FI swap adapter
  adapter: Object.keys(LifiDiamonds).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: LifiDiamonds[chain].start, }
    }
  }, {})
};

export default adapter;
