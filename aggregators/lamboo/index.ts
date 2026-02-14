import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const INTEGRATOR_ADDRESS = "0xc6cc6a4f294c4cab2b749721afc56e9f7e4ad695d44d470cdfa57321fe7205a1";

const FEE_EVENT_TYPES = `
  '0x1cb4fd7144568b4eae2b0d32aaf51fe87fc729eb498295b0a976d91f1692522d::router::FeeEvent',
  '0x1c3206329806286fd2223647c9f9b130e66baeb6d7224a18c1f642ffe48f3b4c::panora_fees_structure::FeeEventIntegrator',
  '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::b::FeeEvent',
  '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::lamboo::FeeEvent'
`;

const APT_TOKEN = "0x000000000000000000000000000000000000000000000000000000000000000a";
const USD1_TOKEN = "0x05fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2";

const fetch = async (_: any, __: any, options: FetchOptions): Promise<FetchResult> => {
  const volumeQuery = `
    WITH date_filter AS (
      SELECT
        from_unixtime(${options.startTimestamp}) AS start_ts,
        from_unixtime(${options.endTimestamp}) AS end_ts
    ),
    filtered_events AS (
      SELECT
        e.tx_version,
        JSON_EXTRACT_SCALAR(e.data, '$.fee_receiver') AS fee_receiver,
        JSON_EXTRACT_SCALAR(e.data, '$.integrator_address') AS integrator_address
      FROM aptos.events e
      CROSS JOIN date_filter d
      WHERE e.block_date >= d.start_ts
        AND e.block_date < d.end_ts
        AND e.event_type IN (${FEE_EVENT_TYPES})
    ),
    fee_events AS (
      SELECT DISTINCT tx_version
      FROM filtered_events
      WHERE fee_receiver = '${INTEGRATOR_ADDRESS}'
        OR integrator_address = '${INTEGRATOR_ADDRESS}'
    ),
    fee_transactions AS (
      SELECT ut.version AS tx_version, ut.sender
      FROM aptos.user_transactions ut
      INNER JOIN fee_events fe
        ON ut.version = fe.tx_version
      CROSS JOIN date_filter d
      WHERE ut.block_date >= d.start_ts
        AND ut.block_date < d.end_ts
    ),
    final_volume AS (
      SELECT
        date_trunc('day', faa.block_date) AS day,
        CASE
          WHEN faa.asset_type IN ('0x1::aptos_coin::AptosCoin', '0xa', '${APT_TOKEN}')
            THEN '0x1::aptos_coin::AptosCoin'
          WHEN faa.asset_type IN (
            '0x5fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2',
            '0x05fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2',
            '${USD1_TOKEN}'
          )
            THEN '${USD1_TOKEN}'
          ELSE faa.asset_type
        END AS token,
        ABS(SUM(
          CASE
            WHEN faa.event_type = '0x1::fungible_asset::Deposit' THEN faa.amount
            WHEN faa.event_type = '0x1::fungible_asset::Withdraw' THEN -faa.amount
            ELSE 0
          END
        )) AS amount
      FROM aptos_fungible_asset.activities faa
      INNER JOIN fee_transactions ft
        ON faa.tx_version = ft.tx_version
       AND faa.owner_address = ft.sender
      CROSS JOIN date_filter d
      WHERE faa.block_date >= d.start_ts
        AND faa.block_date < d.end_ts
        AND faa.asset_type IN (
          '${APT_TOKEN}',
          '${USD1_TOKEN}'
        )
      GROUP BY 1, 2, faa.tx_version
      HAVING ABS(SUM(
        CASE
          WHEN faa.event_type = '0x1::fungible_asset::Deposit' THEN faa.amount
          WHEN faa.event_type = '0x1::fungible_asset::Withdraw' THEN -faa.amount
          ELSE 0
        END
      )) > 0.0001
    )
    SELECT
      day,
      token,
      SUM(amount) AS amount
    FROM final_volume
    GROUP BY 1, 2;
  `;

  const feeQuery = `
    SELECT
      date_trunc('day', block_date) AS day,
      CASE
        WHEN token IN ('0x1::aptos_coin::AptosCoin', '0xa')
          THEN '0x1::aptos_coin::AptosCoin'
        WHEN token IN (
          '0x5fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2',
          '0x05fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2'
        )
          THEN '${USD1_TOKEN}'
        ELSE token
      END AS token,
      SUM(fee_amount) AS amount
    FROM (
      SELECT
        block_date,
        event_type,
        CASE
          WHEN event_type = '0x1cb4fd7144568b4eae2b0d32aaf51fe87fc729eb498295b0a976d91f1692522d::router::FeeEvent'
            THEN JSON_EXTRACT_SCALAR(data, '$.fee_asset')
          WHEN event_type = '0x1c3206329806286fd2223647c9f9b130e66baeb6d7224a18c1f642ffe48f3b4c::panora_fees_structure::FeeEventIntegrator'
            THEN JSON_EXTRACT_SCALAR(data, '$.token_address')
          WHEN event_type = '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::b::FeeEvent'
            THEN JSON_EXTRACT_SCALAR(data, '$.fee_asset')
          WHEN event_type = '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::lamboo::FeeEvent'
            THEN JSON_EXTRACT_SCALAR(data, '$.fee_asset')
        END AS token,
        CASE
          WHEN event_type = '0x1cb4fd7144568b4eae2b0d32aaf51fe87fc729eb498295b0a976d91f1692522d::router::FeeEvent'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.partner_fee_amount') AS DOUBLE)
          WHEN event_type = '0x1c3206329806286fd2223647c9f9b130e66baeb6d7224a18c1f642ffe48f3b4c::panora_fees_structure::FeeEventIntegrator'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.token_amount') AS DOUBLE)
          WHEN event_type = '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::b::FeeEvent'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.fee_amount') AS DOUBLE)
          WHEN event_type = '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::lamboo::FeeEvent'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.fee_amount') AS DOUBLE)
        END AS fee_amount
      FROM aptos.events
      WHERE block_date >= from_unixtime(${options.startTimestamp})
        AND block_date < from_unixtime(${options.endTimestamp})
        AND event_type IN (${FEE_EVENT_TYPES})
        AND (
          (event_type = '0x1cb4fd7144568b4eae2b0d32aaf51fe87fc729eb498295b0a976d91f1692522d::router::FeeEvent'
            AND JSON_EXTRACT_SCALAR(data, '$.fee_receiver') = '${INTEGRATOR_ADDRESS}')
          OR
          (event_type = '0x1c3206329806286fd2223647c9f9b130e66baeb6d7224a18c1f642ffe48f3b4c::panora_fees_structure::FeeEventIntegrator'
            AND JSON_EXTRACT_SCALAR(data, '$.integrator_address') = '${INTEGRATOR_ADDRESS}')
          OR
          (event_type = '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::b::FeeEvent'
            AND JSON_EXTRACT_SCALAR(data, '$.fee_receiver') = '${INTEGRATOR_ADDRESS}')
          OR
          (event_type = '0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::lamboo::FeeEvent'
            AND JSON_EXTRACT_SCALAR(data, '$.fee_receiver') = '${INTEGRATOR_ADDRESS}')
        )
    ) base_events
    WHERE token IN (
      '0x1::aptos_coin::AptosCoin',
      '0xa',
      '${APT_TOKEN}',
      '0x5fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2',
      '0x05fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2',
      '${USD1_TOKEN}'
    )
    GROUP BY 1, 2;
  `;

  const [volumeRows, feeRows] = await Promise.all([
    queryDuneSql(options, volumeQuery),
    queryDuneSql(options, feeQuery, { extraUIDKey: "fees" }),
  ]);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  for (const row of volumeRows ?? []) {
    const token = String(row.token ?? "");
    const amount = Number(row.amount ?? 0);
    if (!token || !Number.isFinite(amount) || amount <= 0) continue;
    dailyVolume.add(token, amount);
  }

  for (const row of feeRows ?? []) {
    const token = String(row.token ?? "");
    const amount = Number(row.amount ?? 0);
    if (!token || !Number.isFinite(amount) || amount <= 0) continue;
    dailyFees.add(token, amount);
  }

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-01-01",
    },
  },
  methodology: {
    Volume: "Volume is calculated by summing the amounts from fee-related transactions involving the integrator address.",
    Fees: "Fees are calculated by aggregating the fees collected from transactions associated with the integrator address.",
  },
  isExpensiveAdapter: true,
};

export default adapter;
