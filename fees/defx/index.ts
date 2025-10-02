import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async () => {
  const response = await fetchURL(
    "https://api.defx.com/v1/open/analytics/market/overview"
  );

  return {
    dailyFees: response.data.dayFees ? Number(response.data.dayFees) : 0,
  };
};

const adapter: Adapter = {
  runAtCurrTime: true,
  fetch,
  start: "2025-10-01",
  chains: [CHAIN.OFF_CHAIN],
};

export default adapter;
