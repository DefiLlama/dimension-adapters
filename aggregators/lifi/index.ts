import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
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

  const blacklistTokens = getDefaultDexTokensBlacklisted(options.chain)
  const dailyVolume = options.createBalances();
  const logs: any[] = (await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537',
    eventAbi: LifiSwapEvent,
  }))
    .filter(log => !blacklistTokens.includes(formatAddress(log.fromAssetId)) && !blacklistTokens.includes(formatAddress(log.toAssetId)))

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
