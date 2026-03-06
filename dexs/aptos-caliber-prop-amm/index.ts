/*
 * Aptos Caliber Prop AMM – daily volume (USDC)
 *
 * Volume = sum of USDC amounts from SwapEventV2:
 * - When token_in is USDC: amount_in / 1e6
 * - When token_out is USDC: amount_out / 1e6
 *
 * Event: 0x9f848aa20dc3829b23079d595ed719f55eec932a6805acf4909be88c88dd4d66::pools::SwapEventV2
 * USDC: 0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const SWAP_EVENT_TYPE =
  "0x9f848aa20dc3829b23079d595ed719f55eec932a6805acf4909be88c88dd4d66::pools::SwapEventV2";
const USDC_TOKEN =
  "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    WITH raw AS (
      SELECT
        block_time,
        json_parse(data) AS event_json
      FROM aptos.events
      WHERE event_type = '${SWAP_EVENT_TYPE}'
        AND TIME_RANGE
    ),
    swaps AS (
      SELECT
        block_time,
        TRY_CAST(json_extract_scalar(event_json, '$.amount_in') AS DECIMAL(38,0)) AS amount_in,
        TRY_CAST(json_extract_scalar(event_json, '$.amount_out') AS DECIMAL(38,0)) AS amount_out,
        json_extract_scalar(event_json, '$.token_in.inner') AS token_in,
        json_extract_scalar(event_json, '$.token_out.inner') AS token_out
      FROM raw
    )
    SELECT
      COALESCE(SUM(
        CASE
          WHEN token_in = '${USDC_TOKEN}' THEN amount_in / DECIMAL '1000000'
          WHEN token_out = '${USDC_TOKEN}' THEN amount_out / DECIMAL '1000000'
        END
      ), 0) AS daily_volume
    FROM swaps
  `
  const data = await queryDuneSql(options, query)

  return {
    dailyVolume: data[0]?.daily_volume ?? 0  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.APTOS],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: '2026-03-02',
}

export default adapter;
