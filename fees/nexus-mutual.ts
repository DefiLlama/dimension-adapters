import {Adapter, Dependencies, FetchOptions } from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {queryDuneSql} from "../helpers/dune";

interface ICombinedData {
  premium_usd: number;
  claim_total: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const mergedQuery = `
      WITH daily_avg_prices AS (
            SELECT
                block_date,
                avg_eth_usd_price,
                avg_dai_usd_price,
                avg_nxm_eth_price,
                avg_nxm_usd_price
            FROM nexusmutual_ethereum.capital_pool_prices
      ),
           covers AS (
               SELECT
                   c.premium * IF(c.cover_asset = 'DAI', p.avg_dai_usd_price, p.avg_eth_usd_price) AS premium_usd
               FROM nexusmutual_ethereum.covers_v1 c
                        INNER JOIN daily_avg_prices p ON c.block_date = p.block_date
               WHERE c.cover_start_date >= FROM_UNIXTIME(${options.startTimestamp})
                 AND c.cover_start_date < FROM_UNIXTIME(${options.endTimestamp})

               UNION ALL
               
               SELECT
                   c.premium_incl_commission * p.avg_nxm_usd_price AS premium_usd
               FROM query_4599092 c
                        INNER JOIN daily_avg_prices p ON c.block_date = p.block_date
               WHERE c.is_migrated = FALSE
                 AND c.cover_start_date >= FROM_UNIXTIME(${options.startTimestamp})
                 AND c.cover_start_date < FROM_UNIXTIME(${options.endTimestamp})
           ),
           total_premiums AS (
               SELECT SUM(premium_usd) AS premium_usd
               FROM covers
           ),
           total_claims AS (
               SELECT
                   SUM(
                           eth_usd_claim_amount +
                           dai_usd_claim_amount +
                           usdc_usd_claim_amount +
                           cbbtc_usd_claim_amount
                   ) AS claim_total
               FROM query_5785588  -- claims paid - base root
               WHERE claim_date >= FROM_UNIXTIME(${options.startTimestamp})
                 AND claim_date < FROM_UNIXTIME(${options.endTimestamp})
           )

      SELECT
          COALESCE(total_premiums.premium_usd, 0) AS premium_usd,
          COALESCE(total_claims.claim_total, 0) AS claim_total
      FROM total_premiums
               CROSS JOIN total_claims;
  `;

  const combinedData: ICombinedData[] = await queryDuneSql(options, mergedQuery);

  const data = combinedData[0];

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(data.premium_usd - data.claim_total);

  const dailyRevenue = dailyFees.clone(0.5);

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees.clone(0.5),
    dailyRevenue: dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailyProtocolRevenue: 0
  };
};

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2019-07-13',
    },
  },
  methodology: {
    Fees: "All premiums paid by members to buy cover insurance minus paid claims. could be negative on some days",
    Revenue: "50% of premiums retained in the capital pool",
    HoldersRevenue: "50% of premiums retained in the capital pool, benefiting all NXM Holders",
    SupplySideRevenue: "50% of premiums distributed as NXM rewards to specific pools stakers",
    ProtocolRevenue: "Protocol takes nothing from paid premiums"
  },
  allowNegativeValue: true // On days with claim payouts, the payout amounts can exceed the fees paid, which results in negative values.
};

export default adapter;