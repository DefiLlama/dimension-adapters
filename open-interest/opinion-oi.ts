import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

/*
  Opinion Prediction Market – Open Interest

  Open Interest is calculated as the net USDT balance
  held by the Opinion market escrow contract on BSC.

  - Incoming USDT transfers increase open interest
  - Outgoing USDT transfers decrease open interest
*/

const VAULT_ADDRESS = "0xad1a38cec043e70e83a3ec30443db285ed10d774";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

const fetch = async (
  _a: any,
  _b: any,
  options: FetchOptions
) => {
  const query = `
    WITH flows AS (
      SELECT
        value / 1e18 AS amount
      FROM erc20_bnb.evt_transfer
      WHERE "to" = '${VAULT_ADDRESS}'
        AND contract_address = '${USDT_BSC}'
        AND evt_block_time <= from_unixtime(${options.endTimestamp})

      UNION ALL

      SELECT
        -value / 1e18 AS amount
      FROM erc20_bnb.evt_transfer
      WHERE "from" = '${VAULT_ADDRESS}'
        AND contract_address = '${USDT_BSC}'
        AND evt_block_time <= from_unixtime(${options.endTimestamp})
    )
    SELECT SUM(amount) AS open_interest
    FROM flows
  `;

  const result = await queryDuneSql(options, query);

  return {
    openInterestUsd: result[0]?.open_interest ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-01-01",
    },
  },
  dependencies: [Dependencies.DUNE],
};

export default adapter;
