-- JitoSOL Related Fees
WITH
    revenue AS (
        -- Withdrawal Fees / Rewards Fee / Orphaned Acc Fees
        SELECT
            block_date,
            jitoSOL_amt,
            usd_amt
        FROM
            query_4908703
        WHERE 
            block_date >= FROM_UNIXTIME({{start}})
            AND block_date < FROM_UNIXTIME({{end}})
        UNION ALL
        -- Interceptor Fees
        SELECT
            block_date,
            jitoSOL_amt,
            usd_amt
        FROM
            query_4908750
        WHERE 
            block_date >= FROM_UNIXTIME({{start}})
            AND block_date < FROM_UNIXTIME({{end}})
    ),
    grouped AS (
        SELECT
            block_date,
            COALESCE(SUM(jitoSOL_amt), 0) AS jitoSOL_amt,
            COALESCE(SUM(usd_amt), 0) AS usd_amt
        FROM
            revenue
        GROUP BY
            block_date
    )
SELECT * FROM grouped
