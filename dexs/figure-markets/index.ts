import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FIGURE_MARKET_ID = "1";
const FEE_RECIPIENT = "pb1aafuyj93xfhs0m3mqzfss29w8darm2xntr6au2spgxjjnx44ghlsfvdkqj";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const alliumQuery = `
    WITH trade_events AS (
        SELECT
            block_timestamp,
            transaction_hash,
            event_index,
            MAX(CASE WHEN key = 'price' THEN TRIM(value, '"') END) AS price_raw,
            MAX(CASE WHEN key = 'source' THEN TRIM(value, '"') END) AS source
        FROM provenance.raw.event_attributes
        WHERE event_type = 'provenance.marker.v1.EventSetNetAssetValue'
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        GROUP BY 1, 2, 3
    ),

    trades AS (
        SELECT
            block_timestamp,
            transaction_hash,
            REGEXP_SUBSTR(price_raw, '[a-zA-Z].*') AS quote_denom,
            TRY_TO_NUMBER(REGEXP_SUBSTR(price_raw, '^[0-9]+')) AS quote_amount_raw
        FROM trade_events
        WHERE source = 'x/exchange market ${FIGURE_MARKET_ID}'
    ),

    volume AS (
        SELECT
            SUM(
                CASE
                    WHEN quote_denom IN ('uusdc.figure.se', 'uusd.trading', 'uylds.fcc')
                    THEN quote_amount_raw / 1e6
                END
            ) AS volume_usd
        FROM trades
    ),

    fee_transfers AS (
        SELECT
            block_timestamp,
            transaction_hash,
            event_index,
            MAX(CASE WHEN key = 'recipient' THEN TRIM(value, '"') END) AS recipient,
            MAX(CASE WHEN key = 'amount' THEN TRIM(value, '"') END) AS amount_raw
        FROM provenance.raw.event_attributes
        WHERE event_type = 'transfer'
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        GROUP BY 1, 2, 3
    ),

    fees AS (
        SELECT
            SUM(TRY_TO_NUMBER(REGEXP_SUBSTR(f.amount_raw, '^[0-9]+'))) / 1e6 AS fees_usd
        FROM fee_transfers f
        JOIN (SELECT DISTINCT transaction_hash FROM trades) s
            USING (transaction_hash)
        WHERE f.recipient = '${FEE_RECIPIENT}'
          AND REGEXP_SUBSTR(f.amount_raw, '[a-zA-Z].*')
              IN ('uusdc.figure.se', 'uusd.trading', 'uylds.fcc')
    )

    SELECT
        COALESCE(v.volume_usd, 0) as volume_usd,
        COALESCE(f.fees_usd, 0) AS fees_usd
    FROM volume v, fees f
  `;

  const alliumResult = await queryAllium(alliumQuery);

  dailyVolume.addUSDValue(alliumResult.volume_usd);
  dailyFees.addUSDValue(alliumResult.fees_usd, METRIC.TRADING_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Volume: "Volume is the total amount of USD traded on the Figure Markets exchange (Market Id 1 on Provenance).",
  Fees: "Total trading fees collected by Figure Markets' fee recipient.",
  Revenue: "All the trading fees collected by Figure Markets' fee recipient.",
  ProtocolRevenue: "All the trading fees collected by Figure Markets' fee recipient.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Total trading fees collected by Figure Markets' fee recipient.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Total trading fees collected by Figure Markets' fee recipient.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Total trading fees collected by Figure Markets' fee recipient.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // will enable post refill
  fetch,
  chains: [CHAIN.PROVENANCE],
  methodology,
  breakdownMethodology,
  start: "2026-01-01",
};

export default adapter;
