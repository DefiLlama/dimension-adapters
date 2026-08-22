import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// https://docs.soroswap.finance
// https://docs.soroswap.finance/additional-resources/01-concepts/01-fees
const FEE_RATE = 0.003;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    SELECT COALESCE(SUM(daily_volume_usd), 0) AS daily_volume
    FROM dune.paltalabs.result_soroswap_volume_per_day_per_pool
    WHERE closed_at_day >= from_unixtime(${options.startTimestamp})
      AND closed_at_day < from_unixtime(${options.endTimestamp})
  `;

  const rows: { daily_volume: number }[] = await queryDuneSql(options, query);

  dailyVolume.addUSDValue(rows[0].daily_volume);
  const fees = rows[0].daily_volume * FEE_RATE;
  dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(fees, METRIC.LP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: "0.3% fee charged on every swap.",
  UserFees: "Traders pay 0.3% fee on each swap.",
  SupplySideRevenue: "All swap fees (0.3%) are distributed to liquidity providers.",
  Revenue: "Soroswap does not take any protocol fee; all fees go to LPs.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.3% fee charged on every swap.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "All swap fees (0.3%) are distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STELLAR],
  start: "2024-03-11",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
