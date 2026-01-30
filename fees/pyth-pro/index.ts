import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import ADDRESSES from "../../helpers/coreAssets.json";

// Douro Labs is the official Pyth Pro data distributor
// They pay 60% of subscription revenue to the Pyth DAO
const DOURO_LABS_ADDRESS = "C6G3jRs1SD7GSNxvKNHJZy7aSar7eZiLioPpDRFFtKTf";
const PYTH_DAO_ADDRESS = "5Unq3fgfSNdyeGjiq2Pu5XAQUJWo2rauKGErbUyxqUGe";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyRevenue = options.createBalances();

  // Query USDC transfers from Douro Labs to Pyth DAO
  const query = `
    SELECT
      SUM(amount) as total_amount
    FROM solana.core.token_transfers
    WHERE block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint = '${USDC_MINT}'
      AND from_owner = '${DOURO_LABS_ADDRESS}'
      AND to_owner = '${PYTH_DAO_ADDRESS}'
  `;

  try {
    const res = await queryAllium(query);
    const amount = res[0]?.total_amount || 0;

    if (amount > 0) {
      // USDC has 6 decimals
      dailyRevenue.add(ADDRESSES.solana.USDC, amount);
    }
  } catch (e) {
    console.error("Pyth Pro fetch error:", e);
  }

  // Total fees = revenue / 0.6 (since Douro keeps 40%)
  // But we only track what reaches the DAO as revenue
  return {
    dailyFees: dailyRevenue, // We report received amount as fees
    dailyRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-01-01",
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "USDC payments from Douro Labs (Pyth Pro data distributor) to Pyth DAO",
    Revenue: "Pyth DAO receives 60% of Pyth Pro subscription revenue from Douro Labs",
  },
};

export default adapter;
