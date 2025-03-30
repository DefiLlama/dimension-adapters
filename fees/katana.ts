import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const res = await queryDuneSql(options, `
    WITH
      pools AS (
          SELECT
              CASE
                  WHEN fee / 1e6 = 0.0001 THEN '3'
                  WHEN fee / 1e6 = 0.003 THEN '3'
                  WHEN fee / 1e6 = 0.01 THEN '3'
                  ELSE '2'
              END AS version,
              CASE
                  WHEN fee / 1e6 = 0.0001 THEN 0.00005
                  WHEN fee / 1e6 = 0.003 THEN 0.0025
                  WHEN fee / 1e6 = 0.01 THEN 0.0085
                  ELSE 0.0025
              END AS lp_fee,
              CASE
                  WHEN fee / 1e6 = 0.0001 THEN 0.00005
                  WHEN fee / 1e6 = 0.003 THEN 0.0005
                  WHEN fee / 1e6 = 0.01 THEN 0.0015
                  ELSE 0.0005
              END AS protocol_fee,
              pool AS pool_address
          FROM
              katana_dex_ronin.KatanaV3Factory_evt_PoolCreated
          UNION ALL
          SELECT
              '2' AS version,
              0.0025 AS lp_fee,
              0.0005 AS protocol_fee,
              _pair AS pool_address
          FROM
              katana_dex_ronin.KatanaFactory_evt_PairCreated
      ),
      fees AS (
          SELECT
              block_time,
              d.version,
              project_contract_address AS pool,
              token_pair,
              amount_usd,
              token_sold_address,
              token_sold_symbol,
              token_sold_amount,
              token_sold_amount * lp_fee * p.price AS lp_fee_amount_usd,
              token_sold_amount * protocol_fee * p.price AS protocol_fee_amount_usd,
              tx_hash
          FROM
              dex.trades d
              JOIN pools p ON p.pool_address = d.project_contract_address
              AND p.version = d.version
              LEFT JOIN (
                  SELECT
                      minute,
                      contract_address,
                      price
                  FROM
                      prices.usd
                  WHERE
                      blockchain = 'ronin'
              ) p ON p.minute = date_trunc('minute', d.block_time)
              AND d.token_sold_address = p.contract_address
          WHERE
              project = 'katana'
              AND blockchain = 'ronin'
              AND d.block_time >= from_unixtime(${options.startTimestamp})
              AND d.block_time <= from_unixtime(${options.endTimestamp})
      )
    SELECT
      SUM(lp_fee_amount_usd) AS lp_fees_usd,
      SUM(protocol_fee_amount_usd) AS protocol_fees_usd
    FROM
      fees;
  `);

  if (res[0]) {
    const { lp_fees_usd, protocol_fees_usd } = res[0];
    dailySupplySideRevenue.addUSDValue(lp_fees_usd || 0);
    dailyRevenue.addUSDValue(protocol_fees_usd || 0);
    dailyFees.addUSDValue((lp_fees_usd || 0) + (protocol_fees_usd || 0));
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyUserFees: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.RONIN]: {
      fetch,
      start: "2021-11-01",
      meta: {
        methodology: {
          Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
          Revenue: "Protocol fees collected by Katana - 0.05% of each trade for most pools",
          SupplySideRevenue: "Fees distributed to LPs - 0.25% of each trade for most pools",
        }
      }
    }
  },
  version: 2,
  isExpensiveAdapter: true,
};

export default adapter;
