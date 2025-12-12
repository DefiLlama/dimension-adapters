import {Adapter, Dependencies, FetchOptions } from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {queryDuneSql} from "../helpers/dune";

interface IData {
  premium_usd: number;
}

const fetch = async ( options: FetchOptions) => {
  const query = `
      WITH daily_avg_prices AS (SELECT block_date,
                                       avg_eth_usd_price,
                                       avg_dai_usd_price,
                                       avg_nxm_eth_price,
                                       avg_nxm_usd_price
                                FROM nexusmutual_ethereum.capital_pool_prices),
           covers AS (SELECT c.cover_id,
                             cover_start_date,
                             cover_end_date,
                             c.premium_asset,
                             c.premium *
                             IF(c.cover_asset = 'DAI', p.avg_dai_usd_price, p.avg_eth_usd_price) AS premium_usd,
                             c.premium * IF(c.cover_asset = 'DAI', p.avg_dai_usd_price, p.avg_eth_usd_price) /
                             p.avg_eth_usd_price                                                 AS premium_eth
                      FROM nexusmutual_ethereum.covers_v1 c
                               INNER JOIN daily_avg_prices p ON c.block_date = p.block_date

                      UNION ALL

                      SELECT c.cover_id,
                             cover_start_date,
                             cover_end_date,
                             c.premium_asset,
                             c.premium_incl_commission * p.avg_nxm_usd_price AS premium_usd,
                             c.premium_incl_commission * p.avg_nxm_eth_price AS premium_eth
                      FROM query_4599092 c
                               INNER JOIN daily_avg_prices p ON c.block_date = p.block_date
                      WHERE c.is_migrated = FALSE)

      SELECT SUM(premium_usd) AS premium_usd
      FROM covers
      WHERE cover_start_date >= FROM_UNIXTIME(${options.startTimestamp})
        AND cover_start_date < FROM_UNIXTIME(${options.endTimestamp})
  `
  const res: IData[] = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(res[0].premium_usd)

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(0.5),
    dailySupplySideRevenue: dailyFees.clone(0.5),
  };
};

const adapter: Adapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2019-07-13',
    },
  },
  methodology: {
    Fees: "All premiums paid by members to buy cover insurance",
    Revenue: "50% of premiums retained in the capital pool",
    SupplySideRevenue: "50% of premiums distributed as NXM rewards to stakers",
  }
};

export default adapter;
