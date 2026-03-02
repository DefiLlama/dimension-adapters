import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// ═══════════════════════════════════════════════════════════════════════
// FlareBank Fees Adapter
// Protocol: FlareBank (https://flrbank.com)
// Chain: Flare Network
// Fee Structure:
//   - Mint (buy):  10% of WFLR input
//   - Burn (sell): 10% of WFLR output (derived from post-fee amount / 9)
//   - Transfer:    1% of BANK transferred
//   - LP Swap:     1% of BANK swapped (transfer to/from LP pool)
// Distribution: 80% holders, 15% team, 5% DAO
// ═══════════════════════════════════════════════════════════════════════

const FLAREBANK_ADDRESS = "0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059";
const WFLR_ADDRESS = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";

// LP pool addresses for swap detection
const LP_ADDRESSES = [
  "0x5F29C8d049e47DD180c2B83E3560E8e271110335", // Enosys V2
  "0x0F574Fc895c1abF82AefF334fA9d8bA43F866111", // SparkDex V2
  "0xd41787672e9C887eF66C42a4c60F00E6e71a762D", // Blazeswap
];

const lpAddressesLower = LP_ADDRESSES.map((a) => a.toLowerCase());

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // ═══════════════════════════════════════════════════════════════════
  // 1. MINT FEES (10% of incoming WFLR)
  // ═══════════════════════════════════════════════════════════════════
  const mintLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi:
      "event onTokenPurchase(address indexed customerAddress, uint256 incomingEthereum, uint256 tokensMinted, address indexed referredBy)",
  });

  mintLogs.forEach((log: any) => {
    const incomingWFLR = BigInt(log.incomingEthereum);
    // incomingEthereum is the gross amount BEFORE the 10% fee
    // fee = 10% of gross
    const fee = incomingWFLR / 10n;
    dailyFees.add(WFLR_ADDRESS, fee, METRIC.MINT_REDEEM_FEES);
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. BURN FEES (10% fee derived from post-fee amount)
  // ═══════════════════════════════════════════════════════════════════
  const burnLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi:
      "event onTokenSell(address indexed customerAddress, uint256 tokensBurned, uint256 ethEarned)",
  });

  burnLogs.forEach((log: any) => {
    // ethEarned is AFTER 10% fee, so original = earned / 0.9
    // fee = original * 0.1 = earned / 9
    const fee = BigInt(log.ethEarned) / 9n;
    dailyFees.add(WFLR_ADDRESS, fee, METRIC.MINT_REDEEM_FEES);
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. TRANSFER + SWAP FEES (1% fee on all BANK transfers)
  // ═══════════════════════════════════════════════════════════════════
  const transferLogs = await options.getLogs({
    target: FLAREBANK_ADDRESS,
    eventAbi:
      "event Transfer(address indexed from, address indexed to, uint256 value)",
  });

  // Addresses to exclude (internal protocol transfers, not user activity)
  const excludeAddresses = [
    FLAREBANK_ADDRESS.toLowerCase(),
    "0x0000000000000000000000000000000000000000",
  ];

  transferLogs.forEach((log: any) => {
    const from = (log.from || "").toLowerCase();
    const to = (log.to || "").toLowerCase();

    // Skip internal mint/burn transfers (already counted above)
    if (excludeAddresses.includes(from) || excludeAddresses.includes(to))
      return;

    const value = BigInt(log.value);
    const feeAmount = value / 100n; // 1% fee

    // Determine if this is a swap (involves an LP address) or a regular transfer
    const isFromLP = lpAddressesLower.includes(from);
    const isToLP = lpAddressesLower.includes(to);
    const isSwap = isFromLP || isToLP;

    if (isSwap) {
      dailyFees.add(FLAREBANK_ADDRESS, feeAmount, METRIC.SWAP_FEES);
    } else {
      dailyFees.add(FLAREBANK_ADDRESS, feeAmount, METRIC.TRADING_FEES);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. REVENUE SPLIT
  // ═══════════════════════════════════════════════════════════════════
  const dailyRevenue = dailyFees.clone();
  const dailyHoldersRevenue = dailyFees.clone();
  const dailyProtocolRevenue = dailyFees.clone();

  // 80% to holders, 20% to protocol (15% team + 5% DAO)
  dailyHoldersRevenue.resizeBy(0.8);
  dailyProtocolRevenue.resizeBy(0.2);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: "2025-02-13",
      meta: {
        methodology: {
          Fees: "10% fee on mints and burns (denominated in WFLR), 1% fee on transfers and LP swaps (denominated in BANK).",
          UserFees:
            "Users pay all fees: 10% on mint/burn, 1% on transfer/swap.",
          Revenue:
            "100% of fees are distributed as revenue: 80% to BANK token holders as dividends, and 20% to the protocol (15% team wallet, 5% DAO treasury).",
          ProtocolRevenue: "20% of all fees: 15% to team wallet, 5% to DAO treasury.",
          HoldersRevenue:
            "80% of all fees distributed as dividends to BANK token holders.",
        },
      },
    },
  },
};

export default adapter;
