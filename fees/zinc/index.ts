import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import ADDRESSES from "../../helpers/coreAssets.json";

const TREASURY = "4Ucw8BNkLWBu6gxkQsw3BRG2qRtw5WrG1UxiKpQjScH5";
const BUYBACK_SOL_VAULT = "8nEo7GArDc3aVDuHoiDYJoVUNLtzgYaVmGGNvxELCZJc";
const STOCKPILE_SOL_VAULT = "8RxMJD7BtdzxuZkmDqcxhR6gWvegLJ1GNf9NFrPkCmwf";
const MeteoraPoolAuthority = "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC";

const BURN_SPLIT_FROM_BUYBACKS = 0.9;
const STAKING_SPLIT_FROM_BUYBACKS = 0.1;

const fetch = async (options: FetchOptions) => {
  const vaults = [TREASURY, STOCKPILE_SOL_VAULT];
  const rows = await queryAllium(`
    SELECT
      to_address,
      SUM(
        CASE
          WHEN to_address = '${TREASURY}' THEN raw_amount
          WHEN from_address != '${TREASURY}' THEN raw_amount
          ELSE 0
        END
      ) AS amount
    FROM solana.assets.transfers
    WHERE to_address IN (${vaults.map((a) => `'${a}'`).join(", ")})
      AND mint = '${ADDRESSES.solana.SOL}'
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY to_address
  `);
  
  // count buy back buy SOL were sent to MeteoraPoolAuthority from TREASURY
  const buybacks = await queryAllium(`
    SELECT
      SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE
      to_address = '${MeteoraPoolAuthority}'
      AND from_address = '${TREASURY}'
      AND mint = '${ADDRESSES.solana.SOL}'
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  const treasuryFlows = options.createBalances();
  const buybackFlows = options.createBalances();
  const stockpileFlows = options.createBalances();
  const flowsByVault: Record<string, typeof treasuryFlows> = {
    [TREASURY]: treasuryFlows,
    [BUYBACK_SOL_VAULT]: buybackFlows,
    [STOCKPILE_SOL_VAULT]: stockpileFlows,
  };
  rows.forEach((row: { to_address: string; amount: number }) => {
    flowsByVault[row.to_address]?.add(ADDRESSES.solana.SOL, row.amount);
  });
  flowsByVault[BUYBACK_SOL_VAULT].add(ADDRESSES.solana.SOL, buybacks[0].amount)

  const dailyFees = options.createBalances();
  dailyFees.addBalances(treasuryFlows, "Mining Fees");
  dailyFees.addBalances(buybackFlows, "Mining Fees");
  dailyFees.addBalances(stockpileFlows, "Mining Fees");

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(treasuryFlows, "Mining Fees to Protocol");
  dailyRevenue.addBalances(buybackFlows.clone(BURN_SPLIT_FROM_BUYBACKS), "Mining Fees to $ZINC Burn");
  dailyRevenue.addBalances(buybackFlows.clone(STAKING_SPLIT_FROM_BUYBACKS), "Mining Fees to $ZINC Stakers");

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addBalances(treasuryFlows, "Mining Fees to Protocol");

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addBalances(buybackFlows.clone(BURN_SPLIT_FROM_BUYBACKS), "Mining Fees to $ZINC Burn");
  dailyHoldersRevenue.addBalances(buybackFlows.clone(STAKING_SPLIT_FROM_BUYBACKS), "Mining Fees to $ZINC Stakers");

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(stockpileFlows, "Mining Fees to Stockpile Prize Pool");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "SOL paid by players when participating in ZINC rounds.",
  UserFees: "SOL paid by players when participating in ZINC rounds.",
  Revenue: "SOL retained by the ZINC treasury and buyback vault.",
  ProtocolRevenue: "SOL retained by the ZINC treasury.",
  HoldersRevenue: "SOL accumulated in the buyback vault, later converted to ZINC and distributed to stakers/burned, on a 10/90 ratio.",
  SupplySideRevenue: "SOL accumulated in the stockpile vault and paid out to stockpile winners.",
};

const breakdownMethodology = {
  Fees: {
    "Mining Fees": "Mining fees paid by players when participating in ZINC rounds.",
  },
  UserFees: {
    "Mining Fees": "Mining fees paid by players when participating in ZINC rounds.",
  },
  Revenue: {
    "Mining Fees to Protocol": "Mining fees retained by the ZINC treasury.",
    "Mining Fees to $ZINC Burn": "Mining fees converted to $ZINC and burned.",
    "Mining Fees to $ZINC Stakers": "Mining fees converted to $ZINC and distributed to stakers.",
  },
  ProtocolRevenue: {
    "Mining Fees to Protocol": "Mining fees retained by the ZINC treasury.",
  },
  HoldersRevenue: {
    "Mining Fees to $ZINC Burn": "Mining fees converted to $ZINC and burned (90% of buyback fees).",
    "Mining Fees to $ZINC Stakers": "Mining fees converted to $ZINC and distributed to stakers (10% of buyback fees).",
  },
  SupplySideRevenue: {
    "Mining Fees to Stockpile Prize Pool": "Mining fees paid to the stockpile prize pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  start: "2026-05-26",
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
