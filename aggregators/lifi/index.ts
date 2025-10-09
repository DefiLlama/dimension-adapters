import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted, getDefaultDexTokensWhitelisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";


const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const integrators = ['jumper.exchange', 'transferto.xyz', 'jumper.exchange.gas', 'lifi-gasless-jumper']

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (options.chain === CHAIN.BITCOIN || options.chain === CHAIN.SOLANA) {
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, integrators, [], 'same-chain');
    return {
      dailyVolume: dailyVolume
    };
  }

  const dailyVolume = options.createBalances();
  let logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537',
    eventAbi: LifiSwapEvent,
  })

  // count volune only from whitelisted tokens
  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
  const whitelistedTokens = await getDefaultDexTokensWhitelisted({chain: options.chain})
  if (whitelistedTokens.length > 0) {
    logs = logs.filter(log => (whitelistedTokens.includes(formatAddress(log.fromAssetId)) || whitelistedTokens.includes(formatAddress(log.toAssetId)))
      && !blacklistedTokens.includes(formatAddress(log.fromAssetId))
      && !blacklistedTokens.includes(formatAddress(log.toAssetId))
    )
  }

  logs.forEach((log: any) => {
    if (!integrators.includes(log.integrator)) {
      dailyVolume.add(log.fromAssetId, log.fromAmount);
    }
  });

  return { dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(LifiDiamonds).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: LifiDiamonds[chain].startTime, }
    }
  }, {})
};

export default adapter;
