import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const INTEGRATOR_ADDRESS = "0xc6cc6a4f294c4cab2b749721afc56e9f7e4ad695d44d470cdfa57321fe7205a1";
const ROUTER_FEE_EVENT = "0x1cb4fd7144568b4eae2b0d32aaf51fe87fc729eb498295b0a976d91f1692522d::router::FeeEvent";
const PANORA_INTEGRATOR_FEE_EVENT = "0x1c3206329806286fd2223647c9f9b130e66baeb6d7224a18c1f642ffe48f3b4c::panora_fees_structure::FeeEventIntegrator";
const BOOSTER_FEE_EVENT = "0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::b::FeeEvent";
const LAMBOO_FEE_EVENT = "0xd5864a543c1d6dbf4f6f3b0a2c660746366cb65fc340d593b966495fdf03a0b::lamboo::FeeEvent";

const FEE_EVENT_TYPE_LIST = [
  ROUTER_FEE_EVENT,
  PANORA_INTEGRATOR_FEE_EVENT,
  BOOSTER_FEE_EVENT,
  LAMBOO_FEE_EVENT,
];
const FEE_EVENT_TYPES = FEE_EVENT_TYPE_LIST.map((eventType) => `'${eventType}'`).join(",\n          ");

const APT_CANONICAL = "0x1::aptos_coin::AptosCoin";
const APT_SHORT = "0xa";
const APT_TOKEN = "0x000000000000000000000000000000000000000000000000000000000000000a";
const USD1_SHORT = "0x5fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2";
const USD1_TOKEN = "0x05fabd1b12e39967a3c24e91b7b8f67719a6dacee74f3c8b9fb7d93e855437d2";
const APT_TOKEN_VARIANTS = [APT_CANONICAL, APT_SHORT, APT_TOKEN];
const USD1_TOKEN_VARIANTS = [USD1_SHORT, USD1_TOKEN];
const TRACKED_TOKEN_VARIANTS = [...APT_TOKEN_VARIANTS, ...USD1_TOKEN_VARIANTS];
const TRACKED_TOKEN_TYPES = TRACKED_TOKEN_VARIANTS.map((token) => `'${token}'`).join(",\n          ");
const APT_TOKEN_TYPES = APT_TOKEN_VARIANTS.map((token) => `'${token}'`).join(", ");
const USD1_TOKEN_TYPES = USD1_TOKEN_VARIANTS.map((token) => `'${token}'`).join(", ");

const fetch = async (_: any, __: any, options: FetchOptions): Promise<FetchResult> => {
  const feeQuery = `
    SELECT
      date_trunc('day', block_date) AS day,
      CASE
        WHEN token IN (${APT_TOKEN_TYPES})
          THEN '${APT_CANONICAL}'
        WHEN token IN (${USD1_TOKEN_TYPES})
          THEN '${USD1_TOKEN}'
        ELSE token
      END AS token,
      SUM(fee_amount) AS amount
    FROM (
      SELECT
        block_date,
        event_type,
        CASE
          WHEN event_type = '${ROUTER_FEE_EVENT}'
            THEN JSON_EXTRACT_SCALAR(data, '$.fee_asset')
          WHEN event_type = '${PANORA_INTEGRATOR_FEE_EVENT}'
            THEN JSON_EXTRACT_SCALAR(data, '$.token_address')
          WHEN event_type = '${BOOSTER_FEE_EVENT}'
            THEN JSON_EXTRACT_SCALAR(data, '$.fee_asset')
          WHEN event_type = '${LAMBOO_FEE_EVENT}'
            THEN JSON_EXTRACT_SCALAR(data, '$.fee_asset')
        END AS token,
        CASE
          WHEN event_type = '${ROUTER_FEE_EVENT}'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.partner_fee_amount') AS DOUBLE)
          WHEN event_type = '${PANORA_INTEGRATOR_FEE_EVENT}'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.token_amount') AS DOUBLE)
          WHEN event_type = '${BOOSTER_FEE_EVENT}'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.fee_amount') AS DOUBLE)
          WHEN event_type = '${LAMBOO_FEE_EVENT}'
            THEN CAST(JSON_EXTRACT_SCALAR(data, '$.fee_amount') AS DOUBLE)
        END AS fee_amount
      FROM aptos.events
      WHERE block_date >= from_unixtime(${options.startTimestamp})
        AND block_date < from_unixtime(${options.endTimestamp})
        AND event_type IN (${FEE_EVENT_TYPES})
        AND (
          (event_type = '${ROUTER_FEE_EVENT}'
            AND JSON_EXTRACT_SCALAR(data, '$.fee_receiver') = '${INTEGRATOR_ADDRESS}')
          OR
          (event_type = '${PANORA_INTEGRATOR_FEE_EVENT}'
            AND JSON_EXTRACT_SCALAR(data, '$.integrator_address') = '${INTEGRATOR_ADDRESS}')
          OR
          (event_type = '${BOOSTER_FEE_EVENT}'
            AND JSON_EXTRACT_SCALAR(data, '$.fee_receiver') = '${INTEGRATOR_ADDRESS}')
          OR
          (event_type = '${LAMBOO_FEE_EVENT}'
            AND JSON_EXTRACT_SCALAR(data, '$.fee_receiver') = '${INTEGRATOR_ADDRESS}')
        )
    ) base_events
    WHERE token IN (
      ${TRACKED_TOKEN_TYPES}
    )
    GROUP BY 1, 2;
  `;

  const feeRows = await queryDuneSql(options, feeQuery, { extraUIDKey: "fees" })

  const dailyFees = options.createBalances();
  for (const row of feeRows ?? []) {
    const token = String(row.token ?? "");
    const amount = Number(row.amount ?? 0);
    if (!token || !Number.isFinite(amount) || amount <= 0) continue;
    dailyFees.add(token, amount);
  }

  return { dailyFees };
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
    Fees: "Fees are calculated by aggregating the fees collected from transactions associated with the integrator address.",
  },
};

export default adapter;
