import {Adapter, Dependencies, FetchOptions } from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {queryDuneSql} from "../helpers/dune";

interface ICoversData {
  premium_usd: number;
}
interface IClaimsData {
  claim_total: number;
}
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const queryCoversData = `
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
                   c.cover_id,
                   cover_start_date,
                   cover_end_date,
                   c.premium_asset,
                   c.premium * IF(c.cover_asset = 'DAI', p.avg_dai_usd_price, p.avg_eth_usd_price) AS premium_usd,
                   c.premium * IF(c.cover_asset = 'DAI', p.avg_dai_usd_price, p.avg_eth_usd_price) / p.avg_eth_usd_price AS premium_eth
               FROM nexusmutual_ethereum.covers_v1 c
                        INNER JOIN daily_avg_prices p ON c.block_date = p.block_date

               UNION ALL
               
               SELECT
                   c.cover_id,
                   cover_start_date,
                   cover_end_date,
                   c.premium_asset,
                   c.premium_incl_commission * p.avg_nxm_usd_price AS premium_usd,
                   c.premium_incl_commission * p.avg_nxm_eth_price AS premium_eth
               FROM query_4599092 c
                        INNER JOIN daily_avg_prices p ON c.block_date = p.block_date
               WHERE c.is_migrated = FALSE
           )
      SELECT SUM(premium_usd) AS premium_usd
      FROM covers
      WHERE cover_start_date >= FROM_UNIXTIME(${options.startTimestamp})
        AND cover_start_date < FROM_UNIXTIME(${options.endTimestamp});
  `

  const queryClaimsData = `
      SELECT
          SUM(
               eth_usd_claim_amount +
               dai_usd_claim_amount +
               usdc_usd_claim_amount +
               cbbtc_usd_claim_amount
          ) AS claim_total
      FROM query_5785588  -- claims paid - base root
      WHERE claim_date >= FROM_UNIXTIME(${options.startTimestamp})
        AND claim_date < FROM_UNIXTIME(${options.endTimestamp});
  `;
  const coversPromise: Promise<ICoversData[]> = queryDuneSql(options, queryCoversData);
  const claimsPromise: Promise<IClaimsData[]> = queryDuneSql(options, queryClaimsData);

  const [coversData,claimsData] : [ICoversData[], IClaimsData[]] = await Promise.all([coversPromise,claimsPromise]);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(coversData[0].premium_usd - claimsData[0].claim_total)
  const dailyRevenue = dailyFees.clone(0.5)

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
