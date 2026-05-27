import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const query = `
    SELECT
      SUM(CAST(json_extract_scalar(event_json, '$.maker_trade_fee') as bigint) / 1e9) as maker_fees, 
      SUM(CAST(json_extract_scalar(event_json, '$.taker_trade_fee') as bigint) / 1e9) as taker_fees, 
      SUM(CAST(json_extract_scalar(event_json, '$.trade_quantity') as double)
      * CAST(json_extract_scalar(event_json, '$.trade_price') as double)
      / 1e18)
      as volume
    FROM sui.events 
    WHERE event_type IN (
        '0x978fed071cca22dd26bec3cf4a5d5a00ab10f39cb8c659bbfdfbec4397241001::isolated_trading::TradeExecutedEvent',
        '0x978fed071cca22dd26bec3cf4a5d5a00ab10f39cb8c659bbfdfbec4397241001::isolated_liquidation::TradeExecutedEvent'
    )
    AND date >= from_unixtime(${options.startTimestamp}) 
    AND date < from_unixtime(${options.endTimestamp})
    AND json_extract_scalar(event_json, '$.maker') != json_extract_scalar(event_json, '$.taker')
`
  const result = await queryDuneSql(options, query)
  const response = result?.[0]
  dailyVolume.addUSDValue(response?.volume ?? 0)
  dailyFees.addUSDValue((response?.maker_fees ?? 0) + (response?.taker_fees ?? 0))
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: "2025-10-15"
    },
  },
  methodology: {
    Fees: 'Perps trading fees paid by users.',
    Revenue: 'All perps trading fees are revenue.',
    ProtocolRevenue: 'All perps trading fees are revenue.',
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true
};

export default adapter;
