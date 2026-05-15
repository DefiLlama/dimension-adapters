import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const WORM_PROGRAM = "WrgN8d3Xe7qTzZw59kiXaf3fAagHHWg78Mbhkn2dTPD";
const CREATOR_PROGRAM = "SormXyTMQ69ux8yhn9CBQ8v7UuqepefMHbM5TcNDtkf";

const fetch = async (options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    WITH calls AS (
      SELECT
        CASE
          WHEN executing_account = '${CREATOR_PROGRAM}' THEN 'Creator Markets'
          WHEN bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) = 100 THEN 'Normal Markets'
          ELSE 'Leverage Markets'
        END AS product,
        CASE
          WHEN executing_account = '${CREATOR_PROGRAM}' THEN 100
          ELSE bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8)))
        END AS leverage_raw,
        CASE
          WHEN executing_account = '${CREATOR_PROGRAM}'
            THEN bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) / 1e6
          ELSE bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 17, 8))) / 1e6
        END AS collateral_usd
      FROM solana.instruction_calls
      WHERE TIME_RANGE
        AND tx_success = true
        AND (
          (
            executing_account = '${WORM_PROGRAM}'
            AND bytearray_length(data) = 25
            AND bytearray_substring(data, 1, 8) = 0x87802f4d0f98f031
            AND bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) BETWEEN 100 AND 1000
          )
          OR (
            executing_account = '${CREATOR_PROGRAM}'
            AND bytearray_length(data) = 16
            AND bytearray_substring(data, 1, 8) = 0x33c29baf6d82606a
          )
        )
    )

    SELECT
      product,
      SUM(collateral_usd) AS volume_usd,
      SUM(collateral_usd * leverage_raw / 100.0) AS notional_volume_usd
    FROM calls
    GROUP BY 1
  `);

  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();

  rows.forEach((row: any) => {
    dailyVolume.addUSDValue(Number(row.volume_usd || 0));
    dailyNotionalVolume.addUSDValue(Number(row.notional_volume_usd || 0));
  });

  return { dailyVolume, dailyNotionalVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-05-04",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Volume tracks successful Worm trades on Solana.",
    NiotionalVolume: "Track total notional (after leverage) volume trades on Worm.",
  },
};

export default adapter;
