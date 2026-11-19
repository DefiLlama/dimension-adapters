import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchVolumeFromLIFIAPI, LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { nullAddress } from "../../helpers/token";
import { formatAddress } from "../../utils/utils";

// APEX DEX routes same-chain swaps through LI.FI with this integrator string.
const INTEGRATORS = ["apex-swap"];

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";

const chainConfig: Record<string, { useApi?: boolean; start: string }> = {
  // first completed apex-swap transfer on Cronos: 2026-11-06
  [CHAIN.CRONOS]: { useApi: true, start: "2026-11-06" },
  [CHAIN.BASE]: { start: "2026-11-10" },
};

const fetch = async (options: FetchOptions) => {
  if (chainConfig[options.chain].useApi) {
    const dailyVolume = await fetchVolumeFromLIFIAPI(
      options.chain,
      options.startTimestamp,
      options.endTimestamp,
      INTEGRATORS,
      [],
      "same-chain",
    );
    return { dailyVolume };
  }

  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    eventAbi: LifiSwapEvent,
  });

  const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain);
  logs.forEach((log: any) => {
    if (!INTEGRATORS.includes(log.integrator)) return;
    if (blacklistedTokens.includes(formatAddress(log.fromAssetId)) || blacklistedTokens.includes(formatAddress(log.toAssetId))) return;
    if (formatAddress(log.fromAssetId) === nullAddress) dailyVolume.add(log.toAssetId, log.toAmount);
    else dailyVolume.add(log.fromAssetId, log.fromAmount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true, // lifi
  methodology: {
    Volume:
      "USD value of completed same-chain swaps routed through LI.FI with integrator apex-swap. Cronos: taken from the LI.FI analytics API (sending.amountUSD). Base: every LiFiGenericSwapCompleted log on the LI.FI diamond carrying that integrator, counted at the input amount, or at the output amount when the input is the native coin.",
  },
};

export default adapter;
