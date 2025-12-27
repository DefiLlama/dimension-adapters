import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

/* ============================================================
   CONFIG
   ============================================================ */

const START_DATE = "2023-11-01";

// Brewlabs token contracts
const brewlabsTokens: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xdAd33e12e61dC2f2692F2c12e6303B5Ade7277Ba",
  [CHAIN.BSC]: "0x6aAc56305825f712Fd44599E59f2EdE51d42C3e7",
};

// Treasury addresses that receive fees
const treasuryAddresses: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x64961Ffd0d84b2355eC2B5d35B0d8D8825A774dc",
  [CHAIN.BSC]: "0x5Ac58191F3BBDF6D037C6C6201aDC9F99c93C53A",
};

/* ============================================================
   EVENT ABIs
   ============================================================ */

const FEES_APPLIED_EVENT = "event FeesApplied(uint8 liquidityFee, uint8 devFee, uint8 buyBackFee, uint8 stakingFee, uint8 holdersFee, uint8 totalFee)";

/* ============================================================
   FETCH
   ============================================================ */

const fetch = async (options: FetchOptions) => {
  const tokenAddress = brewlabsTokens[options.chain];
  const treasuryAddress = treasuryAddresses[options.chain];

  if (!tokenAddress || !treasuryAddress) {
    return {
      dailyFees: "0",
      dailyRevenue: "0",
      dailyProtocolRevenue: "0",
    };
  }

  // Use helper function to track token transfers to treasury
  const dailyFees = await addTokensReceived({
    options,
    tokens: [tokenAddress],
    targets: [treasuryAddress],
  });

  // Get FeesApplied events to calculate actual fee amounts
  const feeLogs = await options.getLogs({
    target: tokenAddress,
    eventAbi: FEES_APPLIED_EVENT,
  });

  // Build a map of transaction hash -> fee percentage
  const feePercentageMap: Record<string, number> = {};
  
  for (const log of feeLogs) {
    const txHash = log.transactionHash;
    const totalFee = Number(log.totalFee || log[5] || 0);
    if (txHash) {
      feePercentageMap[txHash] = totalFee;
    }
  }

  // Get the raw transfer logs to apply fee percentage calculation
  const paddedTreasuryAddress = '0x' + treasuryAddress.slice(2).padStart(64, '0').toLowerCase();
  
  const transferLogs = await options.getLogs({
    target: tokenAddress,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer signature
      null, // from (any address)
      paddedTreasuryAddress, // to (treasury)
    ],
  });

  console.log(`Found ${transferLogs.length} transfers to treasury on ${options.chain}`);
  console.log(`Found ${feeLogs.length} FeesApplied events on ${options.chain}`);

  // Calculate adjusted fees based on the FeesApplied percentage
  let totalAdjustedFees = 0n;
  let processedTransfers = 0;

  for (const log of transferLogs) {
    const value = BigInt(log.data);
    const txHash = log.transactionHash;
    const feePercentage = feePercentageMap[txHash] || 0;
    
    if (feePercentage > 0 && value > 0n) {
      // Calculate the fee portion: (value * feePercentage) / 100
      const fee = (value * BigInt(feePercentage)) / 100n;
      totalAdjustedFees += fee;
      processedTransfers++;
    }
  }

  console.log(`Processed ${processedTransfers} transfers with fees on ${options.chain}`);
  console.log(`Total adjusted fees (raw): ${totalAdjustedFees.toString()}`);

  // Divide by 10^9 to get the proper decimal representation
  const dailyFeesAdjusted = (totalAdjustedFees / BigInt(1e9)).toString();

  return {
    dailyFees: dailyFeesAdjusted,
    dailyRevenue: dailyFeesAdjusted,
    dailyProtocolRevenue: dailyFeesAdjusted,
  };
};

/* ============================================================
   METHODOLOGY
   ============================================================ */

const methodology = {
  Fees: "Fees are calculated by tracking transfers to treasury and applying the fee percentage from FeesApplied events.",
  Revenue: "Protocol revenue equals all fees collected by Brewlabs (transfer amount * fee percentage / 100).",
  ProtocolRevenue: "All protocol fees from Brewlabs token transfers to treasury.",
};

/* ============================================================
   ADAPTER EXPORT
   ============================================================ */

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: START_DATE,
    },
    [CHAIN.BSC]: {
      fetch,
      start: START_DATE,
    },
  },
  methodology,
};

export default adapter;
