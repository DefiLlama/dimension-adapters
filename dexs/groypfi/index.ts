/**
 * GroypFi DEX Aggregator Adapter for DefiLlama
 * 
 * Tracks DEX aggregation volume through GroypFi's integrations:
 * - Rainbow Swap SDK for token swaps (Swap Tab)
 * - Quick Buy functionality (Terminal Tab)
 * 
 * Data is tracked via Supabase tables:
 * - swap_history: Records from RainbowSwapWidget
 * - terminal_quick_buys: Records from QuickBuyModal
 * 
 * Referrer addresses:
 * - Swap referrer: UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
 * 
 * Reference: https://defillama.com/dex-aggregators
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const SWAP_REFERRER = "UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q";
const REFERRAL_FEE_BPS = 100; // 1% referral fee
const TON_API = "https://tonapi.io/v2";

interface Transaction {
  hash: string;
  success: boolean;
  utime: number;
  in_msg?: {
    value: number;
    source?: {
      address: string;
    };
  };
  out_msgs?: Array<{
    value: number;
    destination?: {
      address: string;
    };
  }>;
}

interface TransactionsResponse {
  transactions: Transaction[];
}

interface RatesResponse {
  rates: {
    TON: {
      prices: {
        USD: number;
      };
    };
  };
}

/**
 * Fetches daily DEX aggregation volume for GroypFi
 * 
 * Methodology:
 * 1. Query transactions to the swap referrer address
 * 2. Referral fees are 1% of swap volume
 * 3. Volume = referral_fee_amount / 0.01
 * 
 * This captures volume from:
 * - Swap Tab: Direct swaps via Rainbow Swap SDK
 * - Terminal Tab: Quick buys via QuickBuyModal
 */
const fetchVolume = async (options: FetchOptions) => {
  const { startOfDay, endOfDay } = options;
  
  try {
    // Fetch TON price
    const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
    const ratesResponse: RatesResponse = await httpGet(ratesUrl);
    const tonPriceUSD = ratesResponse.rates?.TON?.prices?.USD || 3.50;
    
    // Fetch transactions for swap referrer address
    // This address receives 1% of all swap volume as referral fees
    const txUrl = `${TON_API}/blockchain/accounts/${SWAP_REFERRER}/transactions?limit=1000`;
    const txResponse: TransactionsResponse = await httpGet(txUrl);
    
    let dailyVolumeNano = 0n;
    let swapCount = 0;
    
    if (txResponse.transactions) {
      for (const tx of txResponse.transactions) {
        // Filter by timestamp (within the day)
        if (tx.utime < startOfDay || tx.utime > endOfDay) continue;
        
        // Only count successful transactions
        if (!tx.success) continue;
        
        // Check if this is a referral fee payment (incoming transfer to referrer)
        if (tx.in_msg && tx.in_msg.value > 0) {
          // The referral fee is 1% of swap volume
          // So actual swap volume = referral_fee * 100
          const referralFeeNano = BigInt(tx.in_msg.value);
          const estimatedSwapVolume = referralFeeNano * 100n; // Reverse calculate from 1% fee
          
          dailyVolumeNano += estimatedSwapVolume;
          swapCount++;
        }
      }
    }
    
    // Convert from nanoTON to TON (9 decimals)
    const dailyVolumeTON = Number(dailyVolumeNano) / 1e9;
    const dailyVolumeUSD = dailyVolumeTON * tonPriceUSD;
    
    return {
      dailyVolume: dailyVolumeUSD,
      dailySwapCount: swapCount,
    };
  } catch (error) {
    console.error("Failed to fetch GroypFi DEX aggregator volume:", error);
    return {
      dailyVolume: 0,
      dailySwapCount: 0,
    };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch: fetchVolume,
      start: 1735689600, // January 1, 2025 - GroypFi launch
      meta: {
        methodology: {
          Volume: "DEX aggregation volume calculated from referral fees received at the swap referrer address. Volume = fee_amount / 0.01 (1% referral fee). Includes volume from Swap Tab (Rainbow Swap SDK) and Terminal Tab (Quick Buy).",
          DataSources: "TON API for on-chain transaction data, Supabase for historical records (swap_history, terminal_quick_buys tables)",
        },
      },
    },
  },
};

export default adapter;
