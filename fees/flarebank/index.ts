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
 * - dailySupplySideRevenue: 80% to holders (they are the supply side)
 * - dailyBribesRevenue: 0
 * - dailyTokenTax: Burns from transfers/swaps (1% of transfer/swap volume)
 * 
 * Submit to: https://github.com/DefiLlama/dimension-adapters/tree/master/fees
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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
  // Mint event: customerAddress indexed, incomingEthereum, tokensMinted, referredBy indexed
  onTokenPurchase: "event onTokenPurchase(address indexed customerAddress, uint256 incomingEthereum, uint256 tokensMinted, address indexed referredBy)",
  
  // Burn event: customerAddress indexed, tokensBurned, ethereumEarned
  onTokenSell: "event onTokenSell(address indexed customerAddress, uint256 tokensBurned, uint256 ethereumEarned)",
  
  // Standard ERC20 Transfer for transfer/swap detection
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
};

// Fee rates
const MINT_BURN_FEE = 10n;  // 10%
const TRANSFER_FEE = 1n;    // 1% fee
const SWAP_FEE = 1n;        // 1% fee

// Distribution percentages
const HOLDERS_SHARE = 80n;   // 80%
const TEAM_SHARE = 15n;      // 15%
const DAO_SHARE = 5n;        // 5%
const PROTOCOL_SHARE = TEAM_SHARE + DAO_SHARE; // 20%

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyTokenTax = options.createBalances();
  
  const lpAddressesLower = LP_ADDRESSES.map(a => a.toLowerCase());
  const bankAddressLower = FLAREBANK_ADDRESS.toLowerCase();
  
  // ═══════════════════════════════════════════════════════════════════════
  // 1. MINT FEES (10% of incoming WFLR)
  // ═══════════════════════════════════════════════════════════════════════
  const mintLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi: EVENTS.onTokenPurchase,
  });
  
  mintLogs.forEach((log: any) => {
    const incomingWFLR = BigInt(log.incomingEthereum);
    const fee = incomingWFLR * MINT_BURN_FEE / 100n;
    dailyFees.addGasToken(fee);
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // 2. BURN FEES (10% of WFLR withdrawn)
  // ═══════════════════════════════════════════════════════════════════════
  const burnLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi: EVENTS.onTokenSell,
  });
  
  burnLogs.forEach((log: any) => {
    const ethereumEarned = BigInt(log.ethereumEarned);
    // ethereumEarned is AFTER 10% fee, so original = earned / 0.9
    // fee = original * 0.1 = earned / 9
    const fee = ethereumEarned / 9n;
    dailyFees.addGasToken(fee);
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // 3. TRANSFER + SWAP FEES (1% burn + 1% fee)
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
    
    // Check if LP swap
    const isFromLP = lpAddressesLower.includes(from);
    const isToLP = lpAddressesLower.includes(to);
    const isSwap = isFromLP || isToLP;
    
    // Transfer/Swap: 1% burned + 1% fee
    // Fee is 1% of sent amount, denominated in BANK
    // We need to convert to WFLR value - use approximate backing ratio
    // For simplicity, track in BANK and let DefiLlama price it
    const burnAmount = value / 100n;  // 1% burned
    const feeAmount = value / 100n;   // 1% fee
    
    // Add the 1% fee to dailyFees (in BANK token)
    dailyFees.add(FLAREBANK_ADDRESS, feeAmount);
    
    // Track burns separately for dailyTokenTax
    dailyTokenTax.add(FLAREBANK_ADDRESS, burnAmount);
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // Calculate revenue splits
  // ═══════════════════════════════════════════════════════════════════════
  
  // Clone balances for distribution calculations
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  
  // Apply distribution percentages
  // 80% to holders, 20% to protocol (team + DAO)
  for (const [token, amount] of Object.entries(dailyFees.getBalances())) {
    const amountBN = BigInt(amount.toString());
    dailyHoldersRevenue.add(token, amountBN * HOLDERS_SHARE / 100n);
    dailyProtocolRevenue.add(token, amountBN * PROTOCOL_SHARE / 100n);
  }
  
  return {
    dailyFees,                              // All fees collected
    dailyUserFees: dailyFees,               // Users pay all fees
    dailyRevenue: dailyProtocolRevenue,     // Team + DAO (20%)
    dailyProtocolRevenue,                   // Team (15%) + DAO (5%)
    dailyHoldersRevenue,                    // 80% to BANK holders as dividends
    dailySupplySideRevenue: dailyHoldersRevenue, // Holders are supply side
    dailyTokenTaxes: dailyTokenTax,          // 1% burns on transfers/swaps
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: "2024-01-15",
      meta: {
        methodology: {
          Fees: "10% fee on mints and burns (WFLR), 1% fee on transfers and LP swaps (BANK).",
          UserFees: "Users pay all fees: 10% on mint/burn, 1% on transfer/swap.",
          Revenue: "20% of fees go to protocol (15% team, 5% DAO treasury).",
          ProtocolRevenue: "15% to team wallet, 5% to DAO treasury.",
          HoldersRevenue: "80% of all fees distributed as dividends to BANK token holders.",
          SupplySideRevenue: "Same as HoldersRevenue - BANK holders provide the liquidity backing.",
          TokenTax: "1% of all transfers and LP swaps are burned, reducing BANK supply.",
        },
      },
    },
  },
};

export default adapter;
