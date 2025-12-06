import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";

const volumeEndpoint = 'https://api.internal.qubit.trade/v1/contract/volume'

const fetch = async (options: FetchOptions) => {
  const { data } = await fetchURL(`${volumeEndpoint}?ts=${options.startOfDay}`)

  const dailyVolume = data.reduce((a: number, b: { volume: string }) => a + Number(b.volume), 0)
  
  return { dailyVolume };
}

const methodology = {
  Volume: "Volume of all perpetual contract trades executed on QuBitDEX, includes leverage."
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2025-09-10",
  methodology: methodology,
};

export default adapter; 