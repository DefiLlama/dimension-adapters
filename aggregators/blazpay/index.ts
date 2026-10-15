import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { blazpayChainConfig, fetchBlazpayVolume } from "../../helpers/aggregators/blazpay";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = await fetchBlazpayVolume(options, 'swap')
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: blazpayChainConfig,
  methodology: {
    Volume: 'Input amount of every same-chain swap executed through the BlazpayRelayer contracts, decoded from the relayer call. Cross-chain transfers are counted under bridge-aggregators/blazpay.',
  },
}

export default adapter
