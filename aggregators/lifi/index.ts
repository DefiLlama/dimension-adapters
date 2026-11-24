import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, LIFI_API_CHAINS, fetchVolumeFromLIFIAPI, getLifiCoreAssets } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted, getDefaultDexTokensWhitelisted } from "../../helpers/lists";
import { nullAddress } from "../../helpers/token";
import { formatAddress } from "../../utils/utils";


const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const NATIVE = nullAddress

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (LIFI_API_CHAINS.includes(options.chain as CHAIN)) {
    // count all integrators, including Jumper
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, [], [], 'same-chain');
    return {
      dailyVolume: dailyVolume
    };
  }

  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537',
    eventAbi: LifiSwapEvent,
    maxBlockRange: 10000, // chunk the RPC-fallback range so chains not on the indexer (e.g. cronos) don't blow the eth_getLogs limit over a full day
  })

  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
  const whitelistedTokens = await getDefaultDexTokensWhitelisted({chain: options.chain})
  const coreAssets = getLifiCoreAssets(options.chain)

  logs.forEach((log: any) => {
    const fromAsset = formatAddress(log.fromAssetId)
    const toAsset = formatAddress(log.toAssetId)
    if (blacklistedTokens.includes(fromAsset) || blacklistedTokens.includes(toAsset)) return;

    // count all integrators, including Jumper
    if (whitelistedTokens.length === 0 || whitelistedTokens.includes(fromAsset) || whitelistedTokens.includes(toAsset)) {
      // Native-in facets (e.g. swapTokensSingleV3NativeToERC20) always emit fromAssetId=0x0
      // and a caller-declared fromAmount that can be unrelated to msg.value. Count the
      // ERC20 out instead — that amount is measured from the diamond's balance.
      if (fromAsset === NATIVE) {
        dailyVolume.add(log.toAssetId, log.toAmount);
      } else {
        dailyVolume.add(log.fromAssetId, log.fromAmount);
      }
      return;
    }

    // Neither token is on the chain's DEX token list. Keep the swap only when one side is a
    // DefiLlama core asset (or native received) and value it on that side, so a mispriced
    // long-tail token never sets the value. Native in is never used (see above).
    if (fromAsset !== NATIVE && coreAssets.has(fromAsset)) {
      dailyVolume.add(log.fromAssetId, log.fromAmount);
    } else if (toAsset === NATIVE || coreAssets.has(toAsset)) {
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
