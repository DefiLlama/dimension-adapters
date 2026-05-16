import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_ENDPOINT = 'https://v1.fermi.trade/api/volume'

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const response = await httpGet(VOLUME_ENDPOINT, {
    params: {
      start_timestamp: options.startTimestamp,
      end_timestamp: options.endTimestamp,
    },
  });

  if (!response.volume_in_quote_units && !response.dailyVolume) {
    throw Error(`No volume data found from fermi api ${VOLUME_ENDPOINT}`);
  }


  return {
    dailyVolume: Number(response.volume_in_quote_units ?? response.dailyVolume),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  start: "2026-05-03",
  fetch,
  methodology: {
    Volume: "Perpetual volume is served by Fermi's monitoring API, which aggregates on-chain perp fills from the SOL-PERP, ETH-PERP, and BTC-PERP markets.",
  },
};

export default adapter;
