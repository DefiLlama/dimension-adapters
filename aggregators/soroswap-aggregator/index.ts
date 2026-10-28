import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// https://docs.soroswap.finance/smart-contracts/soroswap-aggregator
// Legacy aggregator, live from 2025-06-16: topics ["SoroswapAggregator", "swap"], token_in in the event data.
const AGGREGATOR_LEGACY = "CAYP3UWLJM7ZPTUKL6R6BFGTRWLZ46LRKOXTERI2K6BIJAWGYY62TXTO";
// Aggregator v3: topics ["swap", token_in, token_out, user], amount_in in the event data.
// CAVNAZ ran from 2026-09-11 to 2026-09-14 and was replaced by CARVQX, live since 2026-09-14.
const AGGREGATORS_V3 = [
  "CAVNAZFNJU63OFO7XRFQF3FBEVNBQ2SQNJY2A2AJFBGCUNCQK6J5HLER",
  "CARVQXFP4JF5ELLXUMQ6DALR346YVGBMQOHB4ENA7SSVXAYABXLBDDC4",
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // stellar.history_contract_events stores some contract events twice (with and without
  // operation_id), so events are deduplicated on their XDR within each transaction.
  const contracts = [AGGREGATOR_LEGACY, ...AGGREGATORS_V3].map((c) => `'${c}'`).join(", ");
  const query = `
    WITH events AS (
      SELECT DISTINCT transaction_hash, contract_id, contract_event_xdr, topics_decoded, data_decoded
      FROM stellar.history_contract_events
      WHERE closed_at_date = DATE '${options.dateString}'
        AND contract_id IN (${contracts})
        AND type_string = 'ContractEventTypeContract'
        AND successful = true
        AND in_successful_contract_call = true
        AND topics_decoded LIKE '%"symbol":"swap"%'
    ),
    swaps AS (
      SELECT
        CASE
          WHEN contract_id = '${AGGREGATOR_LEGACY}'
            THEN regexp_extract(data_decoded, '"token_in"\\},"val":\\{"address":"([A-Z0-9]+)"\\}', 1)
          ELSE regexp_extract(topics_decoded, '^\\[\\{"symbol":"swap"\\},\\{"address":"([A-Z0-9]+)"\\}', 1)
        END AS token,
        TRY_CAST(regexp_extract(data_decoded, '"amount_in"\\},"val":\\{"i128":"([0-9]+)"\\}', 1) AS DECIMAL(38,0)) AS amount
      FROM events
    )
    SELECT token, CAST(SUM(amount) AS VARCHAR) AS amount
    FROM swaps
    WHERE token IS NOT NULL AND amount > 0
    GROUP BY 1
  `;

  const rows: { token: string; amount: string }[] = await queryDuneSql(options, query);

  rows.forEach(({ token, amount }) => {
    if (token && amount) dailyVolume.add(token, amount);
  });

  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of the input amount (amount_in of token_in) of every swap routed through the Soroswap Aggregator contracts, legacy and v3, read from raw Stellar contract events.",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
      start: "2025-06-16",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
