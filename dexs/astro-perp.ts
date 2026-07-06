import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { METRIC } from "../helpers/metrics";

const API_URL =
  "https://api.astros.ag/api/contract-sub-provider/openapi/pub/defillama";

const methodology = {
  Volume: "Volume of all perpetual contract trades executed on Astros.",
  Fees: "Trading fees and liquidation revenue collected by the protocol.",
  Revenue: "Trading fees and liquidation revenue collected by the protocol.",
};

const fetch = async (options: FetchOptions) => {
  const { data } = await httpGet(API_URL);

  const dailyVolume = Number(data.perp_volume.volume_24h);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(Number(data.revenue.revenue_24h), METRIC.TRADING_FEES);

  return {
    dailyVolume,
    dailyFees: dailyRevenue,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  runAtCurrTime: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]:
        "Trading fees and liquidation revenue collected by the protocol",
    },
    Revenue: {
      [METRIC.TRADING_FEES]:
        "Trading fees and liquidation revenue collected by the protocol",
    },
  },
};

export default adapter;
