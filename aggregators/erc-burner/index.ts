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
const fetch = async (options: any) => {
  const { createBalances, getLogs, chain } = options;
  const dailyVolume = createBalances()

  // Get logs for BurnSuccess events
  const logs = await getLogs({
    target: BURNER_CONTRACTS[chain],
    eventAbi: burnSuccessAbi,
  });

  // Process logs to calculate volume and fees
  logs.forEach((log: any) => {
    const totalAmountOut = log.totalAmountOut;

    // Add to volume (total amount + fee)
    dailyVolume.addGasToken(totalAmountOut);

  });
  return {
    dailyVolume
  };
};

// Create adapter for each chain
const adapter: SimpleAdapter = {
  methodology: {
    Volume: "Volume is calculated by tracking the total amount of native tokens (ETH, AVAX, etc.) processed through the Burner contracts' swapExactInputMultiple function"
  },
  start: '2025-02-23', // Current date as specified
  fetch,
  version: 2,
  chains: Object.keys(BURNER_CONTRACTS),
};

export default adapter;
