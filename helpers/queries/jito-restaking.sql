-- Jito Restaking Related Fees
SELECT
    block_date,
    daily_jitoSOL_amt as jitoSOL_amt,
    COALESCE(usd_amt, 0) as usd_amt
FROM
    query_4908531
WHERE 
    block_date >= FROM_UNIXTIME({{start}})
    and block_date < FROM_UNIXTIME({{end}})
