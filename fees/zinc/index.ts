import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneResult } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const DAILY_VOLUME_AND_FEES_QUERY_ID = "7648342";
const BURN_SPLIT_FROM_BUYBACKS = 0.9;
const STAKING_SPLIT_FROM_BUYBACKS = 0.1;
const TREASURY_SPLIT_FROM_FEES = 0.1;
const STOCKPILE_SPLIT_FROM_FEES = 0.1;
const BUYBACK_SPLIT_FROM_FEES = 0.8;

const fetch = async (options: FetchOptions) => {
  const rows = await queryDuneResult(options, DAILY_VOLUME_AND_FEES_QUERY_ID);
  const dateString = new Date(options.toTimestamp * 1000).toISOString().slice(0, 10);
  const row = rows.find((item: { day?: string }) => String(item.day).slice(0, 10) === dateString);
  const totalDeployFees = Number(row?.daily_revenue_sol ?? 0) * 1e9;

  const treasuryFlows = options.createBalances();
  const buybackFlows = options.createBalances();
  const stockpileFlows = options.createBalances();
  treasuryFlows.add(ADDRESSES.solana.SOL, totalDeployFees * TREASURY_SPLIT_FROM_FEES);
  buybackFlows.add(ADDRESSES.solana.SOL, totalDeployFees * BUYBACK_SPLIT_FROM_FEES);
  stockpileFlows.add(ADDRESSES.solana.SOL, totalDeployFees * STOCKPILE_SPLIT_FROM_FEES);

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
  Fees: "The 10% deploy fee paid in SOL by players when participating in ZINC rounds, sourced from Zinc Dune query 7648342.",
  UserFees: "The 10% deploy fee paid in SOL by players when participating in ZINC rounds.",
  Revenue: "Deploy fees routed to the ZINC treasury and buyback vault after stockpile prize-pool allocations.",
  ProtocolRevenue: "SOL retained by the ZINC treasury.",
  HoldersRevenue: "SOL accumulated in the buyback vault, later converted to ZINC and distributed to stakers/burned, on a 10/90 ratio.",
  SupplySideRevenue: "SOL routed to the stockpile prize pool.",
};

const breakdownMethodology = {
  Fees: {
    "Mining Fees": "The 10% deploy fee paid in SOL by players when participating in ZINC rounds, sourced from Zinc Dune query 7648342.",
  },
  UserFees: {
    "Mining Fees": "The 10% deploy fee paid in SOL by players when participating in ZINC rounds.",
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
  dependencies: [Dependencies.DUNE],
  start: "2026-05-26",
  methodology,
  breakdownMethodology,
};

export default adapter;
