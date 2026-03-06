import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

// Douro Labs is the official Pyth Pro data distributor
// They pay 60% of subscription revenue to the Pyth DAO
const DOURO_LABS_ADDRESS = "C6G3jRs1SD7GSNxvKNHJZy7aSar7eZiLioPpDRFFtKTf";
const PYTH_DAO_ADDRESS = "5Unq3fgfSNdyeGjiq2Pu5XAQUJWo2rauKGErbUyxqUGe";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Query USDC transfers from Douro Labs to Pyth DAO
  const query = `
    SELECT
      SUM(amount) as total_amount
    FROM tokens_solana.transfers
    WHERE block_time BETWEEN FROM_UNIXTIME(${options.startTimestamp}) AND FROM_UNIXTIME(${options.endTimestamp})
      AND token_mint_address = '${USDC_MINT}'
      AND from_owner = '${DOURO_LABS_ADDRESS}'
      AND to_owner = '${PYTH_DAO_ADDRESS}'
  `;

  const res = await queryDuneSql(options, query);
  const amount = res[0]?.total_amount || 0;

  if (amount > 0) {
    // USDC has 6 decimals
    dailyFees.add(ADDRESSES.solana.USDC, amount);
  }

  // Total fees = revenue / 0.6 (since Douro keeps 40%)
  // But we only track what reaches the DAO as revenue
  return {
    dailyFees: dailyFees, // We report received amount as fees
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "USDC payments from Douro Labs (Pyth Pro data distributor) to Pyth DAO",
    Revenue:
      "Pyth DAO receives 60% of Pyth Pro subscription revenue from Douro Labs",
  },
};

export default adapter;
