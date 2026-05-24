import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// https://docs.soroswap.finance
// https://docs.soroswap.finance/additional-resources/01-concepts/01-fees
const FEE_RATE = 0.003;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    SELECT SUM(daily_volume_usd) AS daily_volume
    FROM dune.paltalabs.result_soroswap_volume_per_day_per_pool
    WHERE closed_at_day >= from_unixtime(${options.startTimestamp})
      AND closed_at_day < from_unixtime(${options.endTimestamp})
  `;

  const rows: { daily_volume: number }[] = await queryDuneSql(options, query);

  if (rows[0]?.daily_volume) {
    dailyVolume.addUSDValue(rows[0].daily_volume);
    const fees = rows[0].daily_volume * FEE_RATE;
    dailyFees.addUSDValue(fees);
    dailySupplySideRevenue.addUSDValue(fees);
  }

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

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
      start: "2024-03-11",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
