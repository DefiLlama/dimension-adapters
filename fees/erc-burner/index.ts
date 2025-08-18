import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Contract addresses for each chain
const BURNER_CONTRACTS = {
  [CHAIN.ETHEREUM]: "0x2a0AB930aB078dFEd9B5b56cd783C2C744D5d323",
  [CHAIN.ARBITRUM]: "0x2a0AB930aB078dFEd9B5b56cd783C2C744D5d323",
  [CHAIN.BASE]: "0x2a0AB930aB078dFEd9B5b56cd783C2C744D5d323",
  [CHAIN.BSC]: "0x25025051f8E8c2a5fAaDc25cdFD92f6d25CB0e46",
  [CHAIN.AVAX]: "0x2a0AB930aB078dFEd9B5b56cd783C2C744D5d323",
  [CHAIN.OPTIMISM]: "0x2a0AB930aB078dFEd9B5b56cd783C2C744D5d323",
  [CHAIN.BLAST]: "0x2a0AB930aB078dFEd9B5b56cd783C2C744D5d323",
  [CHAIN.POLYGON]: "0x89B6C6aed65568c3a0e5D35ADF5201Aff75117Ed",
  [CHAIN.ERA]: "0x4B4554bAe261f3A0660592a9E58E429Bd8b3D472",
};

// ABI for the BurnSuccess event (common to all chains)
const burnSuccessAbi = "event BurnSuccess(address indexed user, uint256 totalAmountOut, uint256 feeAmount)";

// Function to fetch volume and fees for a specific chain
const fetchChainData = async (chain: string, options: any) => {
  const { createBalances, getLogs } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  try {
    // Get logs for BurnSuccess events
    const logs = await getLogs({
      target: BURNER_CONTRACTS[chain],
      eventAbi: burnSuccessAbi,
    });

    // Process logs to calculate volume and fees
    logs.forEach((log: any) => {
      const feeAmount = log.feeAmount;

      // Add to fees
      dailyFees.addGasToken(feeAmount);

      // All fees go to revenue (protocol keeps 100% of fees)
      dailyRevenue.addGasToken(feeAmount);
    });
  } catch (error) {
    console.log(`Error fetching logs for ${chain}:`, error);
  }

  return {
    dailyFees,
    dailyRevenue,
  };
};

// Create adapter for each chain
const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(BURNER_CONTRACTS).reduce((acc, chain) => {
    // For other chains, use the standard approach
    acc[chain] = {
      fetch: async (options: any) => fetchChainData(chain, options),
      start: '2025-02-23', // Current date as specified
    };
    return acc;
  }, {}),
  methodology: {
    Fees: "User pays 2.5% of the total amount of tokens they are burning. Fees are calculated by tracking the fee amount from BurnSuccess events.",
    Revenue: "All fees collected by the protocol are considered revenue",
  },
};

export default adapter;
