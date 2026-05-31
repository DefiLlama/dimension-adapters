import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";

const TREASURY = "4Ucw8BNkLWBu6gxkQsw3BRG2qRtw5WrG1UxiKpQjScH5";
const BUYBACK_SOL_VAULT = "8nEo7GArDc3aVDuHoiDYJoVUNLtzgYaVmGGNvxELCZJc";
const STOCKPILE_SOL_VAULT = "8RxMJD7BtdzxuZkmDqcxhR6gWvegLJ1GNf9NFrPkCmwf";

const BURN_SPLIT_FROM_BUYBACKS = 0.9;
const STAKING_SPLIT_FROM_BUYBACKS = 0.1;

const fetch = async (options: FetchOptions) => {
  const treasuryFlows = await getSolanaReceived({ options, targets: [TREASURY], mints: [ADDRESSES.solana.SOL], });
  const buybackFlows = await getSolanaReceived({ options, targets: [BUYBACK_SOL_VAULT], mints: [ADDRESSES.solana.SOL], blacklists: [TREASURY] });
  const stockpileFlows = await getSolanaReceived({ options, targets: [STOCKPILE_SOL_VAULT], mints: [ADDRESSES.solana.SOL], blacklists: [TREASURY] });

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
