import { httpGet } from "../utils/fetchURL";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FEES_URL = `https://bigquery-api-636134865280.europe-west1.run.app/helix_derivative_fees`;

const fetch = async (_: number, _t: any, options: FetchOptions) => {
  const feesRes: any = await httpGet(`${FEES_URL}?start_date=${options.dateString}`);
  if (feesRes.days.length !== 1) throw new Error("No data found for the given date: " + options.dateString);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesRes.exchange_fees_usd, 'Derivative Trading Fees');

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

export default {
  doublecounted: true,
  methodology: {
    Fees: 'Trading fees on Helix derivative markets, sourced from BigQuery (helix_webapp.helix_derivative_volume_and_fee).',
    Revenue: '100% of Helix derivative exchange fees enter the Injective auction and are burned for INJ.',
    HoldersRevenue: '100% of Helix derivative exchange fees burned for INJ via the Injective auction (benefits INJ holders).',
  },
  breakdownMethodology: {
    Fees: {
      'Derivative Trading Fees': 'Sum of |fee_notional_usd| from helix_derivative_volume_and_fee, execution_side = maker_taker.',
    },
    Revenue: {
      'Derivative Trading Fees': 'All Helix derivative exchange fees flow to the Injective burn auction.',
    },
    HoldersRevenue: {
      'Derivative Trading Fees': 'All Helix derivative exchange fees flow to the Injective burn auction (INJ burn benefits holders).',
    },
  },
  fetch,
  start: "2022-09-06",
  chains: [CHAIN.INJECTIVE],
};
