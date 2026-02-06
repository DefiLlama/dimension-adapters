/**
 * FlareBank Fees Adapter for DefiLlama
 * 
 * FlareBank is a dividend-paying token protocol on Flare Network with multiple fee sources.
 * 
 * FEE STRUCTURE:
 * ┌─────────────┬───────────────┬────────────────────────────────┐
 * │ Action      │ Fee           │ Distribution                   │
 * ├─────────────┼───────────────┼────────────────────────────────┤
 * │ Mint (buy)  │ 10% of WFLR   │ 80% holders, 15% team, 5% DAO  │
 * │ Burn (sell) │ 10% of WFLR   │ 80% holders, 15% team, 5% DAO  │
 * │ Transfer    │ 1%            │ 80% holders, 15% team, 5% DAO  │
 * │ LP Swap     │ 1%            │ 80% holders, 15% team, 5% DAO  │
 * └─────────────┴───────────────┴────────────────────────────────┘
 * 
 * METRICS:
 * - dailyFees: All fees collected (mint/burn/transfer/swap fees)
 * - dailyUserFees: Same as dailyFees (users pay all fees)
 * - dailyRevenue: Protocol revenue (team + DAO = 20%)
 * - dailyProtocolRevenue: Team (15%) + DAO (5%) = 20%
 * - dailyHoldersRevenue: 80% of fees to BANK holders
 * 
 * Submit to: https://github.com/DefiLlama/dimension-adapters/tree/master/fees
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics"

// Contracts
const FLAREBANK_ADDRESS = "0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059";
const WFLR_ADDRESS = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";

// V2 LP addresses for swap detection
const LP_ADDRESSES = [
  "0x5f29c8d049e47dd180c2b83e3560e8e271110335", // Enosys V2 BANK/WFLR
  "0x0f574fc895c1abf82aeff334fa9d8ba43f866111", // SparkDex V2 BANK/WFLR
];

// Event ABIs
const EVENTS = {
  onTokenPurchase: "event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount)",
  onTokenSell: "event TokenSell(address indexed user, uint256 burned, uint256 ethEarned)",
  
  // Standard ERC20 Transfer for transfer/swap detection
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
};

// Fee rates
const MINT_BURN_FEE = 10n;  // 10%

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  const bankAddressLower = FLAREBANK_ADDRESS.toLowerCase();
  
  // ═══════════════════════════════════════════════════════════════════════
  // 1. MINT FEES (10% of incoming WFLR)
  // ═══════════════════════════════════════════════════════════════════════
  const mintLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi: EVENTS.onTokenPurchase,
  });
  mintLogs.forEach((log: any) => {
    const incomingWFLR = BigInt(log.value);
    const fee = incomingWFLR * MINT_BURN_FEE / 100n;
    dailyFees.add(WFLR_ADDRESS, fee, METRIC.MINT_REDEEM_FEES);
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // 2. BURN FEES (10% of WFLR withdrawn)
  // ═══════════════════════════════════════════════════════════════════════
  const burnLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi: EVENTS.onTokenSell,
  });
  burnLogs.forEach((log: any) => {
    // const ethereumEarned = BigInt(log.ethEarned);
    // ethereumEarned is AFTER 10% fee, so original = earned / 0.9
    // fee = original * 0.1 = earned / 9
    const fee = log.ethEarned / 9n;
    dailyFees.add(WFLR_ADDRESS, fee, METRIC.MINT_REDEEM_FEES);
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // 3. TRANSFER + SWAP FEES (1% fee)
  // ═══════════════════════════════════════════════════════════════════════
  const transferLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi: EVENTS.Transfer,
  });
  
  transferLogs.forEach((log: any) => {
    const from = log.from.toLowerCase();
    const to = log.to.toLowerCase();
    const value = BigInt(log.value);
    
    // Skip mints (from = 0x0) and burns (to = 0x0 or to = contract)
    if (from === "0x0000000000000000000000000000000000000000") return;
    if (to === "0x0000000000000000000000000000000000000000") return;
    if (to === bankAddressLower) return;
    // Transfer/Swap: 1% fee (1% also burned but burns not counted as fee per reviewer)
    const feeAmount = value / 100n;   // 1% fee
    
    // Add the 1% fee to dailyFees (in BANK token) with label
    dailyFees.add(FLAREBANK_ADDRESS, feeAmount, METRIC.TRADING_FEES);
  });

  const dailyHoldersRevenue = dailyFees.clone(0.8)
  const dailyProtocolRevenue = dailyFees.clone(0.2)
  const dailyRevenue = dailyHoldersRevenue.clone()
  dailyRevenue.addBalances(dailyProtocolRevenue)
  
  return {
    dailyFees,                              // All fees collected (with labels)
    dailyUserFees: dailyFees,               // Users pay all fees
    dailyRevenue: dailyRevenue,             // Team + DAO (20%) + Holders Revenue
    dailyProtocolRevenue,                   // Team (15%) + DAO (5%)
    dailyHoldersRevenue,                    // 80% to BANK holders as dividends
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
      Fees: "10% fee on mints and burns (WFLR), 1% fee on transfers and LP swaps (BANK).",
      UserFees: "Users pay all fees: 10% on mint/burn, 1% on transfer/swap.",
      Revenue: "20% of fees go to protocol (15% team, 5% DAO treasury).",
      ProtocolRevenue: "15% to team wallet, 5% to DAO treasury.",
      HoldersRevenue: "80% of all fees distributed as dividends to BANK token holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "A 10% fee is charged when minting and redeeming WFLR",
      [METRIC.SWAP_FEES]: "A 1% fee is charged on swaps and transfers"
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: "A 10% fee is charged when minting and redeeming WFLR",
      [METRIC.SWAP_FEES]: "A 1% fee is charged on swaps and transfers"
    },
    ProtocolRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "15% of fees go to the team and 5% to the DAO",
      [METRIC.SWAP_FEES]: "15% of fees go to the team and 5% to the DAO"
    },
    HoldersRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "80% of the fees are paid as dividends to BANK holders",
      [METRIC.SWAP_FEES]: "80% of the fees are paid as dividends to BANK holders"
    }
  },
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: "2025-02-13",
    },
  },
};

export default adapter;
