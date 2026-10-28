import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const PEPTIDES_CG_ID = "peptides-2";
const PEPTIDES_MINT = "61aNNrrRp81a3ZztDL69dNyrcshBsqWZdWVSrpYpump";
const BURN_WALLET = "6TfZee8VA7FKGKxrt56z3YnffrSS3aBX1kKJNiDh5a3N";
const BURN_FEE_RATE = 0.1;
const PEPTIDES_DECIMALS = 6;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const query = `
    SELECT
      COALESCE(SUM(raw_amount) / 1e${PEPTIDES_DECIMALS}, 0) AS peptides_burnt
    FROM solana.assets.transfers
    WHERE mint = '${PEPTIDES_MINT}'
      AND from_address = '${BURN_WALLET}'
      AND type IN ('burn', 'burnChecked')
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;
  const data = await queryAllium(query);

  const peptidesBurnt = data[0].peptides_burnt;
  if (peptidesBurnt > 0) {
    const grossSales = peptidesBurnt * (1 / (BURN_FEE_RATE));
    const ProtocolRevenue = grossSales - peptidesBurnt;
    dailyFees.addCGToken(PEPTIDES_CG_ID, grossSales, "Merchandise Sales");
    dailyHoldersRevenue.addCGToken(PEPTIDES_CG_ID, peptidesBurnt, "Merchandise Sales to Buybacks");
    dailyProtocolRevenue.addCGToken(PEPTIDES_CG_ID, ProtocolRevenue, "Merchandise Sales to Protocol Operations");
  }

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.add(dailyProtocolRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Gross revenue from paid merchandise sales at PEPTIDES (tracked as 10 times of $PEPTIDES burnt using burn wallet).",
  Revenue: "Includes 90% of revenue retained for PEPTIDES store and 10% allocated to the $PEPTIDES buyback program.",
  HoldersRevenue: "10% of gross merchandise sales allocated to the $PEPTIDES buyback program.",
  ProtocolRevenue: "90% of revenue retained for PEPTIDES store operations.",
};

const breakdownMethodology = {
  Fees: {
    "Merchandise Sales": "Daily gross revenue from paid merchandise sales at PEPTIDES (tracked as 10 times of $PEPTIDES burnt using burn wallet).",
  },
  HoldersRevenue: {
    "Merchandise Sales to Buybacks": "10% of gross merchandise sales allocated to the $PEPTIDES buyback and burn program.",
  },
  ProtocolRevenue: {
    "Merchandise Sales to Store Operations": "90% of revenue retained for PEPTIDES store operations.",
  },
  Revenue: {
    "Merchandise Sales to Buybacks": "10% of gross merchandise sales allocated to the $PEPTIDES buyback program.",
    "Merchandise Sales to Store Operations": "90% of revenue retained for PEPTIDES store operations.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-27",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
