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
  const dailyVolume = createBalances();
  const totalVolume = createBalances();

  try {
    // Get logs for BurnSuccess events
    const logs = await getLogs({
      target: BURNER_CONTRACTS[chain],
      eventAbi: burnSuccessAbi,
      fromBlock: options.fromBlock,
      toBlock: options.toBlock,
    });

    // Process logs to calculate volume and fees
    logs.forEach((log: any) => {
      const totalAmountOut = log.totalAmountOut;
      
      // Add to volume (total amount + fee)
      dailyVolume.addGasToken(totalAmountOut);
      
      // Add to total volume (cumulative)
      totalVolume.addGasToken(totalAmountOut);
    });
  } catch (error) {
    console.log(`Error fetching logs for ${chain}:`, error);
  }

  return {
    dailyVolume,
    totalVolume
  };
};

// Create adapter for each chain
const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(BURNER_CONTRACTS).reduce((acc, chain) => {
    // For other chains, use the standard approach
    acc[chain] = {
      fetch: async (options: any) => fetchChainData(chain, options),
      start: 1740330000, // Current date as specified
      meta: {
        methodology: {
          Volume: "Volume is calculated by tracking the total amount of native tokens (ETH, AVAX, etc.) processed through the Burner contracts' swapExactInputMultiple function"
        },
      },
    };
    return acc;
  }, {}),
};

export default adapter;
