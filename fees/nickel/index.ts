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
  const dailyBurn = options.createBalances();
  const dailyTokensBought = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  // Sum all values from buybacks in the time period
  // getLogs automatically filters by block timestamp, but we also filter by event timestamp parameter
  let totalEthSpent = BigInt(0);
  let totalAmountBurned = BigInt(0);
  let totalNickelBought = BigInt(0);
  let totalAmountToTreasury = BigInt(0);
  
  for (const log of logs) {
    // Filter by event timestamp parameter if it's within the time range
    const eventTimestamp = Number(log.timestamp);
    if (eventTimestamp >= options.startTimestamp && eventTimestamp < options.endTimestamp) {
      totalEthSpent += BigInt(log.nativeAmount || "0");
      totalAmountBurned += BigInt(log.burnedAmount || "0");
      totalNickelBought += BigInt(log.nickelAmount || "0");
      totalAmountToTreasury += BigInt(log.treasuryAmount || "0");
    }
  }

  // nativeAmount from contract event is already in wei (smallest unit)
  dailyRevenue.addGasToken(totalEthSpent);
  
  // amountBurned, nickelBought, and amountToTreasury are in token units (BigInt)
  dailyBurn.add(`${CHAIN.BASE}:${NICKEL_TOKEN_ADDRESS}`, totalAmountBurned);
  dailyTokensBought.add(`${CHAIN.BASE}:${NICKEL_TOKEN_ADDRESS}`, totalNickelBought);
  dailyHoldersRevenue.add(`${CHAIN.BASE}:${NICKEL_TOKEN_ADDRESS}`, totalAmountToTreasury);

  return {
    dailyRevenue,
    dailyBurn,
    dailyTokensBought,
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
    Burn: "Total amount of tokens burned.",
    TokensBought: "Total nickel tokens bought.",
    HoldersRevenue: "Total amount sent to Staking contract.",
  },
};

export default adapter;

