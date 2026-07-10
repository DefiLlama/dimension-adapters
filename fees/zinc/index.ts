import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const VOLUME_ENDPOINT = "https://zinc.cash/api/volume/daily";
const BUYBACK_SOL_VAULT = "8nEo7GArDc3aVDuHoiDYJoVUNLtzgYaVmGGNvxELCZJc";
const DEPLOY_FEE_BPS = 1_000n;
const BPS_DENOMINATOR = 10_000n;

const toLamports = (value: unknown) => {
  if (typeof value === "bigint") return value > 0n ? value : 0n;
  if (typeof value === "number") return BigInt(Math.max(0, Math.trunc(value)));

  const wholeLamports = String(value ?? "0").trim().split(".")[0];
  if (!/^-?\d+$/.test(wholeLamports)) return 0n;

  const amount = BigInt(wholeLamports);
  return amount > 0n ? amount : 0n;
};
const bps = (amount: bigint, basisPoints: bigint) => (amount * basisPoints) / BPS_DENOMINATOR;

const fetchGrossRoundVolume = async (options: FetchOptions) => {
  const rows = await queryDuneSql(
    options,
    `
      WITH response AS (
        SELECT http_get('${VOLUME_ENDPOINT}') AS body
      )
      SELECT
        json_extract_scalar(day_item, '$.gross_lamports') AS gross_lamports
      FROM response
      CROSS JOIN UNNEST(CAST(json_extract(body, '$.daily') AS array(json))) AS t(day_item)
      WHERE json_extract_scalar(day_item, '$.day') = '${options.dateString}'
    `,
    { extraUIDKey: "zinc-volume" },
  );

  if (!rows.length) throw new Error(`No Zinc gross round volume found for ${options.dateString}`);
  return toLamports(rows[0].gross_lamports);
};

const fetchBuybackVaultInflow = async (options: FetchOptions) => {
  const rows = await queryDuneSql(
    options,
    `
      SELECT
        CAST(COALESCE(
          SUM(CASE WHEN post_balance > pre_balance THEN post_balance - pre_balance ELSE 0 END),
          0
        ) AS varchar) AS buyback_lamports
      FROM solana.account_activity
      WHERE address = '${BUYBACK_SOL_VAULT}'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND token_mint_address IS NULL
        AND tx_success = true
    `,
    { extraUIDKey: "zinc-buyback-vault" },
  );

  return toLamports(rows[0]?.buyback_lamports);
};

const fetch = async (options: FetchOptions) => {
  const [grossRoundVolume, buybackVaultInflow] = await Promise.all([
    fetchGrossRoundVolume(options),
    fetchBuybackVaultInflow(options),
  ]);

  const fees = bps(grossRoundVolume, DEPLOY_FEE_BPS);

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, fees.toString(), "Mining Fees");

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.add(ADDRESSES.solana.SOL, buybackVaultInflow.toString(), "Buyback Vault Inflow");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "The 10% deploy fee paid in SOL on gross SOL deployed in ZINC mining rounds.",
  UserFees: "The 10% deploy fee paid in SOL on gross SOL deployed in ZINC mining rounds.",
  Revenue: "All deploy fees are counted as revenue.",
  HoldersRevenue: "SOL flowing into the ZINC buyback vault.",
};

const breakdownMethodology = {
  Fees: {
    "Mining Fees": "The 10% deploy fee paid in SOL on gross SOL deployed in ZINC mining rounds.",
  },
  UserFees: {
    "Mining Fees": "The 10% deploy fee paid in SOL on gross SOL deployed in ZINC mining rounds.",
  },
  Revenue: {
    "Mining Fees": "All deploy fees are counted as revenue.",
  },
  HoldersRevenue: {
    "Buyback Vault Inflow": "SOL flowing into the ZINC buyback vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2026-05-26",
  methodology,
  breakdownMethodology,
};

export default adapter;
