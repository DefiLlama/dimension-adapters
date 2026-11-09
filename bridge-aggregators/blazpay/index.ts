import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { blazpayChainConfig, fetchBlazpayVolume } from "../../helpers/aggregators/blazpay";

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = await fetchBlazpayVolume(options, 'bridge')
  return { dailyBridgeVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: blazpayChainConfig,
  methodology: {
    BridgeVolume: 'Input amount of every cross-chain transfer started through the BlazpayRelayer contracts (LI.FI, Symbiosis, Router Nitro, Squid, Across, Relay, NEAR Intents and others), decoded from the relayer call and counted on the source chain.',
  },
}

export default adapter
