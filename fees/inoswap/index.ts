import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const LLAMA_URL = "https://inoswap.org/api/llama/metrics";

const fetch = async (_: FetchOptions): Promise<FetchResultV2> => {
  const m: any = await fetchURL(LLAMA_URL);

  const dailyFees = Number(m?.dailyFeesUsd || 0);
  const dailyRevenue = Number(m?.dailyRevenueUsd || 0);
  const dailyProtocolRevenue = Number(m?.dailyProtocolRevenueUsd || 0);
  const dailySupplySideRevenue = Number(m?.dailySupplySideRevenueUsd || 0);
  const dailyUserFees = Number(m?.dailyUserFeesUsd || 0);

  return {
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue.toString(),
    dailyUserFees: dailyUserFees.toString(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      runAtCurrTime: true,
      start: "2026-02-01",
      metadata: {
        methodology: {
          Fees: "Estimated from daily executed aggregator volume and configured fee bps.",
          Revenue: "Net protocol revenue from aggregator fees.",
          ProtocolRevenue: "Treasury share of protocol revenue.",
          SupplySideRevenue: "Distributor/partner side share from fees.",
          UserFees: "Fees directly paid by users on executed aggregator routes.",
        },
      },
    },
  },
};

export default adapter;
