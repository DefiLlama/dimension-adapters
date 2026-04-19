import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface IHelixFeesDailyData {
  date: string;
  fees_usd: number;
}

interface IHelixFeesResponse {
  days: IHelixFeesDailyData[];
  total_fees_usd: number;
}

const URL = "https://bigquery-api-636134865280.europe-west1.run.app/helix_fees";

const fetch = async (_: number, _t: any, options: FetchOptions) => {
  const res: IHelixFeesResponse = await httpGet(`${URL}?start_date=${options.dateString}`);
  if (res.days.length !== 1) throw new Error("No Helix fee data found for the given date: " + options.dateString);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(res.total_fees_usd, "Helix Relayer Share");

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

export default {
  methodology: {
    Fees: "40% of exchange fees on spot and derivative fills routed through Helix (orders submitted with fee_recipient = inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh, the null fee recipient sentinel). Helix forfeits its 40% relayer share to the exchange module's auction basket.",
    Revenue: "100% of Helix's relayer share. Helix does not keep any of this revenue — all of it is deposited into the auction basket, sold for INJ, and burned.",
    HoldersRevenue: "100% of Helix's relayer share. The burned INJ accrues to all INJ holders via supply reduction.",
  },
  fetch,
  start: "2023-02-16",
  chains: [CHAIN.INJECTIVE],
  doublecounted: true,
};
