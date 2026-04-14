select
    dt,
   	protocol_name,
    revenue_usd as revenue,
    gross_yield_usd as fees
from dune.sparkdotfi.result_spark_sll_actual_revenue_daily
where dt = date '{{dt}}'
