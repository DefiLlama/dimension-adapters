import fetchURL from "../utils/fetchURL";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (_: number): Promise<FetchResultFees> => {
  const data = await fetchURL(
    "https://lend.api.sui-prod.bluefin.io/api/v1/fees/daily"
  );
  const dailyFees = Number(data.fees);
  const dailyRevenue = Number(data.fees);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees:
      "All fees paid/earned while using lending/borrowing and liquidation.",
    Revenue: "Fees collected by protocol native markets.",
    ProtocolRevenue: "Fees/liquidation collected by protocol.",
  },
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-06-17",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
