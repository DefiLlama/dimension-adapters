import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BUYBACK_CONTRACT = "0x55836bD72800b23c64D384E8734330B8363e62Fa";
const NICKEL_TOKEN_ADDRESS = "0xE3F0CDCfC6e154a60b1712147BdC7Be9203dEabA";

// Event signature: SwapExecuted(address indexed user, uint256 nativeAmount, uint256 nickelAmount, uint256 burnedAmount, uint256 treasuryAmount, uint256 timestamp)
const SWAP_EXECUTED_EVENT = "event SwapExecuted(address indexed user, uint256 nativeAmount, uint256 nickelAmount, uint256 burnedAmount, uint256 treasuryAmount, uint256 timestamp)";

const fetchData: any = async (_a: any, _b: any, options: FetchOptions) => {
  // Get block range for the target day
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  
  console.log(`[NICKEL] Fetching logs from block ${fromBlock} to ${toBlock}`);
  console.log(`[NICKEL] Timestamp range: ${options.fromTimestamp} to ${options.toTimestamp}`);
  
  // Get all SwapExecuted events from the buyback contract for the specific day
  const logs = await options.getLogs({
    target: BUYBACK_CONTRACT,
    eventAbi: SWAP_EXECUTED_EVENT,
    fromBlock,
    toBlock,
  });

  console.log(`[NICKEL] Found ${logs.length} SwapExecuted events`);

  // Initialize balances for each metric
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  // Sum all values from buybacks in the time period
  // getLogs already filters by block timestamp (fromBlock/toBlock), so we use all logs returned
  // Mapping:
  // - dailyRevenue = nativeAmount (ETH spent on buybacks)
  // - dailyHoldersRevenue = 10% of dailyRevenue
  let totalEthSpent = BigInt(0);
  
  // Process all logs - getLogs already filtered by block range for the target day
  for (const log of logs) {
    const nativeAmount = BigInt(log.nativeAmount || "0");
    const eventTimestamp = Number(log.timestamp);
    const ethAmount = Number(nativeAmount) / 1e18;
    
    console.log(`[NICKEL] Event - nativeAmount: ${nativeAmount.toString()} (${ethAmount.toFixed(6)} ETH), timestamp: ${eventTimestamp}`);
    
    // nativeAmount = ETH spent (in wei)
    totalEthSpent += nativeAmount;
  }
  
  const totalEth = Number(totalEthSpent) / 1e18;
  console.log(`[NICKEL] Total ETH spent: ${totalEthSpent.toString()} wei (${totalEth.toFixed(6)} ETH)`);

  // dailyRevenue = total ETH spent (nativeAmount is already in wei)
  // addGasToken accepts BigInt directly
  console.log(`[NICKEL] Adding to dailyRevenue: ${totalEthSpent.toString()} wei (type: ${typeof totalEthSpent})`);
  dailyRevenue.addGasToken(totalEthSpent);
  
  // Check what's in dailyRevenue after adding
  const revenueBalances = dailyRevenue.getBalances();
  console.log(`[NICKEL] dailyRevenue balances after addGasToken:`, JSON.stringify(revenueBalances, null, 2));
  
  // dailyHoldersRevenue = 10% of dailyRevenue
  const dailyHoldersRevenueAmount = dailyRevenue.clone(0.10);
  dailyHoldersRevenue.addBalances(dailyHoldersRevenueAmount.getBalances());
  
  console.log(`[NICKEL] dailyHoldersRevenue (10%):`, JSON.stringify(dailyHoldersRevenue.getBalances(), null, 2));
  
  // Final verification - get USD value to see what the system will display
  const revenueUSD = dailyRevenue.getUSDValue();
  console.log(`[NICKEL] dailyRevenue USD value: ${revenueUSD}`);
  const holdersUSD = dailyHoldersRevenue.getUSDValue();
  console.log(`[NICKEL] dailyHoldersRevenue USD value: ${holdersUSD}`);

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

