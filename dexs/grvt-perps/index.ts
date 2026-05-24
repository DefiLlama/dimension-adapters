import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpPost, postURL } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";

const GRVT_PERPS_API_URL = "https://market-data.grvt.io/lite/v1";
const headers = {
  "Content-Type": "application/json",
}

export async function fetch(_a: any, _b: any, options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const instrumentsList = await postURL(`${GRVT_PERPS_API_URL}/all_instruments`, {
    headers,
  })
  const perpInstruments = instrumentsList.r.filter((instrument: any) => instrument.k === "PERPETUAL").map((instrument: any) => instrument.i);

  const START_NS = (options.startOfDay * 1e9).toString()
  const END_NS = ((options.startOfDay + (24 * 60 * 60)) * 1e9).toString()

  await PromisePool.withConcurrency(3).for(perpInstruments).process(async (instrument) => {
    const body = {
      i: instrument,
      i1: 'CI_1_D',
      t: 'TRADE',
      st: START_NS,
      et: END_NS,
      l: 10
    }
    const ohlcv = await httpPost(`${GRVT_PERPS_API_URL}/kline`, body, { headers });

    const todaysData = ohlcv.r.find((data: any) => data.ot === START_NS);
    dailyVolume.addUSDValue(Number(todaysData?.vq || 0))
    await sleep(1000);
  });

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.GRVT],
  fetch,
  start: '2024-12-01',
};

export default adapter;
