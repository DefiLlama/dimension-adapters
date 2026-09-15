import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../adapters/types";
import { LifiDiamonds, LIFI_API_CHAINS, fetchVolumeFromLIFIAPI } from "../helpers/aggregators/lifi";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { CHAIN } from "../helpers/chains";
import { formatAddress } from "../utils/utils";

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const integrators = ['grom-exchange']
const START = '2026-08-22'

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.BASE,
]

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    eventAbi: LifiSwapEvent,
  });

  logs.forEach((log: any) => {
    if (integrators.includes(log.integrator) && !getDefaultDexTokensBlacklisted(options.chain).includes(formatAddress(log.toAssetId)) && !getDefaultDexTokensBlacklisted(options.chain).includes(formatAddress(log.fromAssetId))) {
      dailyVolume.add(log.toAssetId, log.toAmount);
    }
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains,
  start: START,
  methodology: {
    Volume: "Same-chain swap volume routed through LI.FI with integrator grom-exchange. API-routed chains use LI.FI analytics; other chains use LiFiGenericSwapCompleted logs on the LI.FI diamond. Other GROM routers are excluded.",
  },
};

export default adapter;
