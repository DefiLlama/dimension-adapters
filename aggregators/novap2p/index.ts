import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";
const INTEGRATOR = "nova-p2p";
const NATIVE = ADDRESSES.null;

const chainConfig: Record<string, { start: string; wrappedNative: string }> = {
  [CHAIN.BSC]: { start: "2026-11-06", wrappedNative: ADDRESSES.bsc.WBNB },
  [CHAIN.ARBITRUM]: { start: "2026-11-27", wrappedNative: ADDRESSES.arbitrum.WETH },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: LifiDiamonds[options.chain].id, eventAbi: LifiSwapEvent, maxBlockRange: 10000 });
  const wrappedNative = chainConfig[options.chain].wrappedNative.toLowerCase();
  const isCore = (token: string) => token === NATIVE || isCoreAsset(options.chain, token);
  const isWrapOrUnwrap = (from: string, to: string) => [from, to].includes(NATIVE) && [from, to].includes(wrappedNative);

  for (const log of logs) {
    if (log.integrator !== INTEGRATOR) continue;
    const from = log.fromAssetId.toLowerCase();
    const to = log.toAssetId.toLowerCase();
    if (isWrapOrUnwrap(from, to)) continue;
    if (isCore(to) && (from === NATIVE || !isCore(from))) dailyVolume.add(to, log.toAmount);
    else if (isCore(from)) dailyVolume.add(from, log.fromAmount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Same-chain swaps NovaP2P Swap routes through LI.FI under its integrator "nova-p2p", each counted once on its native-coin or major-token side. Wrapping or unwrapping the native coin and swaps between two minor tokens are not counted.',
  },
};

export default adapter;
