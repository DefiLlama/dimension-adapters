import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BUYBACK_CONTRACT = "0x55836bD72800b23c64D384E8734330B8363e62Fa";
const NICKEL_TOKEN_ADDRESS = "0xE3F0CDCfC6e154a60b1712147BdC7Be9203dEabA";

// Event signature: SwapExecuted(address indexed user, uint256 nativeAmount, uint256 nickelAmount, uint256 burnedAmount, uint256 treasuryAmount, uint256 timestamp)
const SWAP_EXECUTED_EVENT = "event SwapExecuted(address indexed user, uint256 nativeAmount, uint256 nickelAmount, uint256 burnedAmount, uint256 treasuryAmount, uint256 timestamp)";

const fetchData: any = async (_a: any, _b: any, options: FetchOptions) => {
  // Get all SwapExecuted events from the buyback contract
  const logs = await options.getLogs({
    target: BUYBACK_CONTRACT,
    eventAbi: SWAP_EXECUTED_EVENT,
  });

  // Initialize balances for each metric
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  // Sum all values from buybacks in the time period
  // getLogs automatically filters by block timestamp, so we use all logs returned
  // Mapping from subgraph:
  // - dailyRevenue = ethSpent = nativeAmount (ETH spent on buybacks)
  // - dailyHoldersRevenue = amountToTreasury = treasuryAmount (tokens sent to staking contract)
  let totalEthSpent = BigInt(0);
  let totalAmountToTreasury = BigInt(0);
  
  for (const log of logs) {
    // nativeAmount = ETH spent (in wei)
    totalEthSpent += BigInt(log.nativeAmount || "0");
    // treasuryAmount = tokens sent to treasury/staking contract (in token units)
    totalAmountToTreasury += BigInt(log.treasuryAmount || "0");
  }

  // dailyRevenue = total ETH spent (nativeAmount is already in wei)
  dailyRevenue.addGasToken(totalEthSpent);
  
  // dailyHoldersRevenue = total tokens sent to treasury/staking contract (treasuryAmount in token units)
  // Use token address directly (the chain context is already set by options)
  dailyHoldersRevenue.add(NICKEL_TOKEN_ADDRESS, totalAmountToTreasury);

  return {
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch: fetchData,
  chains: [CHAIN.BASE],
  start: "2024-01-01", // Update this with the actual start date
  methodology: {
    Revenue: "Total ETH spent on buybacks.",
    HoldersRevenue: "Total amount sent to Staking contract.",
  },
};

export default adapter;

