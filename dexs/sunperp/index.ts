import { PromisePool } from "@supercharge/promise-pool";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const API_BASE = "https://api.sunperp.com";

const fetch = async (options: FetchOptions) => {
  const { data } = await fetchURL(`${API_BASE}/sapi/v1/public/contract_info?business_type=swap`);
  const contracts = data.filter(({ contract_status }: any) => contract_status === 1);
  // Avoid Error Handling, Contract list is current; some markets may not have klines for older dates.
  const { results } = await PromisePool.withConcurrency(3)
    .for(contracts)
    .process(async ({ contract_code }: any) => {
      const { data = [] } = await fetchURLAutoHandleRateLimit(
        `${API_BASE}/sapi/v1/market/history/kline?contract_code=${encodeURIComponent(contract_code)}&period=1day&from=${options.startOfDay}&to=${options.endTimestamp}`
      );
      return data.reduce(
        (sum: number, { id, trade_turnover }: any) =>
          id >= options.startOfDay && id < options.endTimestamp ? sum + Number(trade_turnover || 0) : sum,
        0
      );
    });

  return {
    dailyVolume: results.reduce((sum, volume) => sum + volume, 0),
  };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TRON],
  start: "2025-09-10",
};

export default adapter;