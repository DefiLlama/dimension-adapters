import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const API_ENDPOINT = "https://perps.standx.com/api";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const symbolsResponse: any[] = await fetchURLAutoHandleRateLimit(`${API_ENDPOINT}/query_symbol_info`);
  const symbols = symbolsResponse.filter((item: any) => item.status === "trading" || item.status === "reduce_only");

  for (const { symbol, maker_fee, taker_fee } of symbols as any[]) {
    const marketInfo: any = await fetchURLAutoHandleRateLimit(
      `${API_ENDPOINT}/kline/history?symbol=${symbol}&from=${options.startOfDay}&to=${options.endTimestamp}&resolution=60&countback=50`,
    );
    if (!marketInfo.t) continue;

    const volume = marketInfo.t.reduce((sum: number, time: number, i: number) => {
      if (time < options.startOfDay || time >= options.endTimestamp) return sum;
      return sum + marketInfo.v[i] * marketInfo.c[i];
    }, 0);
    const fees = volume * (Number(maker_fee) + Number(taker_fee));

    dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
    dailyRevenue.addUSDValue(fees, "Trading Fees To Protocol");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "All trading fees collected from perpetual futures trades on StandX",
  Revenue: "All trading fees collected by StandX",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees paid by traders on perpetual futures trades",
  },
  Revenue: {
    "Trading Fees To Protocol": "Trading fees collected by StandX",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STANDX],
  start: "2025-11-24",
  methodology,
  breakdownMethodology,
};

export default adapter;
