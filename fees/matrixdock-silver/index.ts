import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

// Matrixdock XAGm sources:
// XAGm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/faq
// XAGm token design / FRS fee model: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/token-design
// XAGm mint/redeem transparency API: https://www.matrixdock.com/transparency/on-chain-transactions

const CG_TOKEN = "matrixdock-silver";
const API = "https://www.matrixdock.com/rwa/anon/website/api/v1/transparency/issue-redeem/list?symbol=XAGM";
const REDEMPTION_FEE = 0.005;
const chainConfig = {
  [CHAIN.CHAIN_GLOBAL]: { start: "2026-03-09" },
  [CHAIN.ETHEREUM]: { start: "2026-03-09", xagm: "0x123ffe0a3C62878dcbee2742227dc8990058d9E1" },
  [CHAIN.SUI]: { start: "2026-04-22" },
};

const getRecords = async (options: FetchOptions) => {
  const items = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await httpGet(`${API}&offset=${offset}&limit=1000`);
    for (const record of data.items) {
      const timestamp = record.tx_time / 1000;
      if (timestamp < options.fromTimestamp) return items;
      if (record.record_type === "REDEEM" && timestamp < options.toTimestamp) items.push(record);
    }
    if (offset + data.items.length >= data.total) return items;
  }
};

const getSuiData = async (options: FetchOptions) => {
  const data: any[] = await queryDuneSql(options, `
    WITH states AS (
      SELECT
        timestamp_ms,
        CAST(COALESCE(json_extract_scalar(object_json, '$.fields.oz_per_token_base'), json_extract_scalar(object_json, '$.content.fields.oz_per_token_base'), json_extract_scalar(object_json, '$.oz_per_token_base')) AS DOUBLE) AS oz_per_token_base,
        CAST(COALESCE(json_extract_scalar(object_json, '$.fields.annual_fee_rate'), json_extract_scalar(object_json, '$.content.fields.annual_fee_rate'), json_extract_scalar(object_json, '$.annual_fee_rate')) AS DOUBLE) AS annual_fee_rate,
        CAST(COALESCE(json_extract_scalar(object_json, '$.fields.oz_per_token_base_time'), json_extract_scalar(object_json, '$.content.fields.oz_per_token_base_time'), json_extract_scalar(object_json, '$.oz_per_token_base_time')) AS DOUBLE) AS oz_per_token_base_time
      FROM sui.objects
      WHERE object_id = 0xc2aa8379b988f31442f2435d61b739ca34872f841a2ee304e4d19c4152f12b4c
        AND date >= DATE '2026-04-22'
        AND timestamp_ms < ${options.toTimestamp * 1000}
    ),
    from_state AS (
      SELECT * FROM states
      WHERE timestamp_ms <= ${options.fromTimestamp * 1000}
      ORDER BY timestamp_ms DESC
      LIMIT 1
    ),
    to_state AS (
      SELECT * FROM states
      ORDER BY timestamp_ms DESC
      LIMIT 1
    ),
    xagm_txs AS (
      SELECT DISTINCT transaction_digest
      FROM sui.transaction_objects
      WHERE object_id = 0xc2aa8379b988f31442f2435d61b739ca34872f841a2ee304e4d19c4152f12b4c
        AND date >= DATE '2026-04-22'
        AND timestamp_ms < ${options.toTimestamp * 1000}
    ),
    supply AS (
      SELECT SUM(
        CASE
          WHEN event_type = '0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::MintEvent' AND json_extract_scalar(event_json, '$.et') = '0' THEN CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE)
          WHEN event_type = '0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::CCReceiveTokenEvent' THEN CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE)
          WHEN event_type IN ('0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::RedeemEvent', '0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::CCSendTokenEvent') THEN -CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE)
        END
      ) / 1e9 AS supply
      FROM sui.events
      WHERE transaction_digest IN (SELECT transaction_digest FROM xagm_txs)
        AND event_type IN (
          '0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::MintEvent',
          '0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::CCReceiveTokenEvent',
          '0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::RedeemEvent',
          '0x4fffa6fa7410f28aee62153a61f18c53e478365604f9ee4f70c558a742eabf2f::mtoken::CCSendTokenEvent'
        )
        AND date >= DATE '2026-04-22'
        AND timestamp_ms < ${options.toTimestamp * 1000}
    )
    SELECT s.supply, from_state.oz_per_token_base AS from_base, from_state.annual_fee_rate AS from_rate, from_state.oz_per_token_base_time AS from_time, to_state.oz_per_token_base AS to_base, to_state.annual_fee_rate AS to_rate, to_state.oz_per_token_base_time AS to_time
    FROM supply s, from_state, to_state
  `, { extraUIDKey: "matrixdock-silver-sui-supply" });

  return data[0] || {};
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (options.chain === CHAIN.CHAIN_GLOBAL) {
    const records = await getRecords(options);
    for (const record of records) {
      const fee = Number(record.fine_weight) * REDEMPTION_FEE;
      dailyFees.addCGToken(CG_TOKEN, fee, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.addCGToken(CG_TOKEN, fee, METRIC.MINT_REDEEM_FEES);
    }
  }

  if (options.chain === CHAIN.ETHEREUM) {
    const logs = await options.getLogs({
      target: chainConfig[CHAIN.ETHEREUM].xagm,
      eventAbi: "event ReconcileSupply(uint64 lastReconcileTime, uint64 thisReconcileTime, uint256 amount)",
      fromBlock: await options.getFromBlock(),
    });
    for (const log of logs) {
      const fee = Number(log.amount) / 1e9;
      dailyFees.addCGToken(CG_TOKEN, fee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.addCGToken(CG_TOKEN, fee, METRIC.MANAGEMENT_FEES);
    }
  }

  if (options.chain === CHAIN.SUI) {
    const data = await getSuiData(options);
    const oz = (base: number, rate: number, time: number, timestamp: number) => base - Math.floor(rate * Math.max(0, Math.floor((timestamp - time) / 86400)) / 365);
    const feeOz = oz(Number(data.from_base), Number(data.from_rate), Number(data.from_time), options.fromTimestamp) - oz(Number(data.to_base), Number(data.to_rate), Number(data.to_time), options.toTimestamp);
    if (feeOz > 0) {
      const fee = Number(data.supply || 0) * feeOz / oz(Number(data.to_base), Number(data.to_rate), Number(data.to_time), options.toTimestamp);
      dailyFees.addCGToken(CG_TOKEN, fee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.addCGToken(CG_TOKEN, fee, METRIC.MANAGEMENT_FEES);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: "XAGm custody fees and redemption fees.",
    Revenue: "XAGm custody and redemption fees accounted as protocol revenue.",
    ProtocolRevenue: "XAGm custody and redemption fees accounted as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees from Ethereum ReconcileSupply events and Sui FRS ozPerToken accrual.",
      [METRIC.MINT_REDEEM_FEES]: "0.50% fee charged on XAGm redemption orders from Matrixdock mint/redeem transparency records.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees accounted as protocol revenue.",
      [METRIC.MINT_REDEEM_FEES]: "XAGm redemption fee accounted as protocol revenue.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees accounted as protocol revenue.",
      [METRIC.MINT_REDEEM_FEES]: "XAGm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;
