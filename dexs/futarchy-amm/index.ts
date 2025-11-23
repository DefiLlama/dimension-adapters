import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();

  const query = `
    WITH futswap AS (
        SELECT
            block_time,
            tx_signer,
            tx_id,
            data,
            CASE
                WHEN to_hex(SUBSTR(data, 105, 1)) = '00' THEN 'buy'
                WHEN to_hex(SUBSTR(data, 105, 1)) = '01' THEN 'sell'
            END AS swap_type,
            from_big_endian_64(reverse(SUBSTR(data, 106, 8))) / 1e6 AS input_amount,
            from_big_endian_64(reverse(SUBSTR(data, 114, 8))) / 1e6 AS output_amount,
            CASE
                WHEN LENGTH(data) = 406 THEN to_base58(SUBSTR(data, 279, 32))
                WHEN LENGTH(data) = 670 THEN to_base58(SUBSTR(data, 543, 32))
            END AS token
        FROM solana.instruction_calls
        WHERE executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
          AND inner_executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
          AND account_arguments[1] = 'DGEympSS4qLvdr9r3uGHTfACdN8snShk4iGdJtZPxuBC'
          AND cardinality(account_arguments) = 1
          AND is_inner = true
          AND tx_success = true
          AND CAST(data AS VARCHAR) LIKE '0xe445a52e51cb9a1d%'
          AND LENGTH(data) >= 300
          AND array_join(log_messages, ' ') LIKE '%SpotSwap%'
    )
    SELECT
        date_trunc('day', block_time) AS day,
        SUM(
            CASE WHEN swap_type = 'buy'
                 THEN input_amount
                 ELSE output_amount
            END
        ) AS volume,
        SUM(
            CASE WHEN swap_type = 'buy'
                 THEN input_amount
                 ELSE output_amount
            END
        ) * 0.0025 AS rev
    FROM futswap
    WHERE swap_type IN ('buy', 'sell')
    GROUP BY 1
    ORDER BY 1;
  `;

  const result = await queryDuneSql(options, query);

  if (result && result[0]) {
    const volume = result[0].volume || 0;
    const rev = result[0].rev || 0;

    // USDC mint
    const usdc = "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    dailyVolume.addToken(usdc, volume);
    dailyRevenue.addToken(usdc, rev);
  }

  return {
    dailyVolume,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1728432060, // October 9, 2024 00:01 UTC
    },
  },

  methodology: {
    Volume:
      "Volume represents total USDC-equivalent value swapped via Futarchy AMM SpotSwap events. For buys, volume = input_amount; for sells, volume = output_amount.",
    Revenue:
      "Revenue is calculated as 0.25% of each swap's USDC-equivalent value (volume * 0.0025).",
  },
};

export default adapter;
