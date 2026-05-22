import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FIXED_ONE = 100_000_000;
const ZEST_V1_DEPLOYER = "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N";

interface AssetData {
  contract: string;
  cgId: string;
  decimals: number;
}

const assetList: AssetData[] = [
  { contract: `${ZEST_V1_DEPLOYER}.wstx`, cgId: "blockstack", decimals: 6 },
  { contract: "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token", cgId: "stacking-dao", decimals: 6 },
  { contract: "SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc", cgId: "usd-coin", decimals: 6 },
  { contract: "SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1", cgId: "hermetica-usdh", decimals: 8 },
  { contract: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token", cgId: "bitcoin", decimals: 8 },
  { contract: "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2", cgId: "bitcoin", decimals: 6 },
];
const ASSETS: Record<string, AssetData> = Object.fromEntries(assetList.map((asset) => [asset.contract, asset]));
const ASSET_FILTER = Object.keys(ASSETS).map((asset) => `'${asset}'`).join(",");

const chainConfig = {
  [CHAIN.STACKS]: { start: "2024-02-23" },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const rows: {
    asset: string;
    borrow_interest: number;
    protocol_interest: number;
    flashloan_fees: number;
    flashloan_protocol_fees: number;
  }[] = await queryAllium(`
    WITH reserve_events_raw AS (
      SELECT
        e.tx_id,
        e.event_index,
        e.burn_block_time,
        REGEXP_SUBSTR(e.event_contents:contract_log:value:repr::string, '\\(key ''([^'']+)''\\)\\)\\) \\(type "set-reserve-state"\\)', 1, 1, 'e', 1) AS asset,
        TRY_TO_NUMBER(REGEXP_SUBSTR(e.event_contents:contract_log:value:repr::string, '\\(accrued-to-treasury u([0-9]+)\\)', 1, 1, 'e', 1)) AS accrued
      FROM stacks.raw.events e
      JOIN stacks.raw.transactions t ON e.tx_id = t.tx_id
      WHERE e.burn_block_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.tx_status = 'success'
        AND t.canonical
        AND t.microblock_canonical
        AND e.event_type = 'smart_contract_log'
        AND e.event_contents:contract_log:contract_id::string = '${ZEST_V1_DEPLOYER}.pool-reserve-data'
        AND e.event_contents:contract_log:value:repr::string LIKE '%(type "set-reserve-state")%'
    ),
    reserve_events AS (
      SELECT * FROM reserve_events_raw
      WHERE burn_block_time >= TO_TIMESTAMP_NTZ(${options.startOfDay}) AND asset IN (${ASSET_FILTER})
      UNION ALL
      SELECT * FROM (
        SELECT * FROM reserve_events_raw
        WHERE burn_block_time < TO_TIMESTAMP_NTZ(${options.startOfDay}) AND asset IN (${ASSET_FILTER})
        QUALIFY ROW_NUMBER() OVER (PARTITION BY asset ORDER BY burn_block_time DESC, tx_id DESC, event_index DESC) = 1
      )
    ),
    treasury_deltas AS (
      SELECT
        burn_block_time,
        asset,
        GREATEST(accrued - LAG(accrued) OVER (PARTITION BY asset ORDER BY burn_block_time, tx_id, event_index), 0) AS protocol_interest
      FROM reserve_events
    ),
    borrow_interest AS (
      SELECT
        d.asset,
        protocol_interest * ${FIXED_ONE} / CASE
          WHEN burn_block_time >= TO_TIMESTAMP_NTZ('2026-04-28 13:43:29') THEN 95000000
          WHEN burn_block_time >= TO_TIMESTAMP_NTZ('2026-03-02 14:17:00') THEN 50000000
          WHEN burn_block_time >= TO_TIMESTAMP_NTZ('2026-02-17 18:31:03') THEN 20000000
          ELSE 10000000
        END AS borrow_interest,
        d.protocol_interest
      FROM treasury_deltas d
      WHERE d.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startOfDay})
        AND d.protocol_interest > 0
    ),
    flashloans AS (
      SELECT * FROM (
        SELECT
          REGEXP_SUBSTR(e.event_contents:contract_log:value:repr::string, '\\(asset ''([^'']+)''\\)', 1, 1, 'e', 1) AS asset,
          TRY_TO_NUMBER(REGEXP_SUBSTR(e.event_contents:contract_log:value:repr::string, '\\(amount-fee u([0-9]+)\\)', 1, 1, 'e', 1)) AS flashloan_fees,
          TRY_TO_NUMBER(REGEXP_SUBSTR(e.event_contents:contract_log:value:repr::string, '\\(protocol-fee u([0-9]+)\\)', 1, 1, 'e', 1)) AS flashloan_protocol_fees
        FROM stacks.raw.events e
        JOIN stacks.raw.transactions t ON e.tx_id = t.tx_id
        WHERE e.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startOfDay})
          AND e.burn_block_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND t.tx_status = 'success'
          AND t.canonical
          AND t.microblock_canonical
          AND e.event_type = 'smart_contract_log'
          AND e.event_contents:contract_log:contract_id::string LIKE '${ZEST_V1_DEPLOYER}.pool-borrow%'
          AND e.event_contents:contract_log:value:repr::string LIKE '%(type "flashloan")%'
      )
      WHERE asset IN (${ASSET_FILTER})
    )
    SELECT
      asset,
      SUM(borrow_interest) AS borrow_interest,
      SUM(protocol_interest) AS protocol_interest,
      SUM(flashloan_fees) AS flashloan_fees,
      SUM(flashloan_protocol_fees) AS flashloan_protocol_fees
    FROM (
      SELECT asset, borrow_interest, protocol_interest, 0 AS flashloan_fees, 0 AS flashloan_protocol_fees FROM borrow_interest
      UNION ALL
      SELECT asset, 0 AS borrow_interest, 0 AS protocol_interest, flashloan_fees, flashloan_protocol_fees FROM flashloans
    )
    GROUP BY asset
  `);

  for (const row of rows) {
    const { cgId, decimals } = ASSETS[row.asset];
    const scale = 10 ** decimals;
    const borrowInterest = Number(row.borrow_interest ?? 0) / scale;
    const protocolInterest = Number(row.protocol_interest ?? 0) / scale;
    const flashloanFees = Number(row.flashloan_fees ?? 0) / scale;
    const flashloanProtocolFees = Number(row.flashloan_protocol_fees ?? 0) / scale;

    dailyFees.addCGToken(cgId, borrowInterest, METRIC.BORROW_INTEREST);
    dailyFees.addCGToken(cgId, flashloanFees, METRIC.FLASHLOAN_FEES);
    dailyRevenue.addCGToken(cgId, protocolInterest, METRIC.PROTOCOL_FEES);
    dailyRevenue.addCGToken(cgId, flashloanProtocolFees, METRIC.FLASHLOAN_FEES);
    dailySupplySideRevenue.addCGToken(cgId, borrowInterest - protocolInterest, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.addCGToken(cgId, flashloanFees - flashloanProtocolFees, METRIC.FLASHLOAN_FEES);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Interest paid by borrowers, plus any flashloan fees.",
  Revenue: "The share of borrower interest and flashloan fees kept by Zest.",
  ProtocolRevenue: "The share of borrower interest and flashloan fees kept by Zest.",
  SupplySideRevenue: "The remaining borrower interest and flashloan fees paid to lenders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid on Zest v1 loans.",
    [METRIC.FLASHLOAN_FEES]: "Fees paid for Zest v1 flashloans.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Zest's share of borrower interest.",
    [METRIC.FLASHLOAN_FEES]: "Zest's share of flashloan fees.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Zest's share of borrower interest.",
    [METRIC.FLASHLOAN_FEES]: "Zest's share of flashloan fees.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Borrower interest paid to lenders.",
    [METRIC.FLASHLOAN_FEES]: "Flashloan fees paid to lenders.",
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  pullHourly: true,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
