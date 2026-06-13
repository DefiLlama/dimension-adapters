import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const rows = await queryDuneSql(options, `
    with meta as (
      select json_parse(http_get('https://api10.afx.xyz/info/public/product-meta', ARRAY['Accept: application/json','User-Agent: Mozilla/5.0'])) as j
    ),
    markets as (
      select json_extract_scalar(p,'$.symbol') as symbol
      from meta cross join unnest(cast(json_extract(j,'$.data.perpProducts') as array(json))) as t(p)
    ),
    k as (
      select symbol,
        json_parse(http_get(concat('https://api10.afx.xyz/info/kline/last?symbol_name=', symbol, '&interval=86400&limit=30'), ARRAY['Accept: application/json','User-Agent: Mozilla/5.0'])) as j
      from markets
    ),
    candles as (
      select
        cast(json_extract_scalar(c,'$.timestamp') as bigint) as ts,
        cast(json_extract_scalar(c,'$.turnover') as double) as turnover_usd
      from k cross join unnest(cast(json_extract(j,'$.data') as array(json))) as t(c)
    )
    select coalesce(sum(turnover_usd), 0) as daily_volume
    from candles
    where ts = ${options.startOfDay}
  `);

  dailyVolume.addUSDValue(rows[0].daily_volume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.AFX],
  start: "2026-05-12",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Sum of daily turnover (notional volume in USD) across all AFX perpetual trading pairs.",
  },
};

export default adapter;
