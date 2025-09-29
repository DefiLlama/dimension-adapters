select
    dt,
    sum(revenue_usd) as revenue,
    sum(gross_yield_usd) as fees
from dune.sparkdotfi.result_spark_sll_actual_revenue_daily
where dt = date '{{dt}}'
group by dt