import { CHAIN } from "../../helpers/chains";
import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await queryDuneSql(
    options,
    `
    WITH base_data AS (
      SELECT
        evt_block_time,
        input_mint,
        input_amount,
        output_mint,
        output_amount
      FROM dflow_solana.swap_orchestrator_evt_swapevent
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    prices AS (
      SELECT
        timestamp AS minute,
        contract_address_varchar AS mint_address,
        price,
        decimals
      FROM prices.minute
      WHERE timestamp >= from_unixtime(${options.startTimestamp})
        AND timestamp < from_unixtime(${options.endTimestamp})
        AND blockchain = 'solana'
    ),
    volumes AS (
      SELECT
        GREATEST(
          COALESCE(bd.input_amount / POW(10, p_in.decimals) * p_in.price, 0),
          COALESCE(bd.output_amount / POW(10, p_out.decimals) * p_out.price, 0)
        ) AS volume_usd
      FROM base_data bd
      LEFT JOIN prices p_in
        ON DATE_TRUNC('minute', bd.evt_block_time) = p_in.minute
        AND bd.input_mint = p_in.mint_address
      LEFT JOIN prices p_out
        ON DATE_TRUNC('minute', bd.evt_block_time) = p_out.minute
        AND bd.output_mint = p_out.mint_address
    )
    SELECT SUM(volume_usd) AS volume
    FROM volumes
    WHERE volume_usd > 0
  `,
  );

  return {
    dailyVolume: data[0].volume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2025-04-01",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  methodology: {
    Volume:
      "Volume is calculated by summing the USD value of all trades routed through DFlow aggregator.",
  },
  isExpensiveAdapter: true,
};

export default adapter;
