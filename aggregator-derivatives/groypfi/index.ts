/**
 * GroypFi Aggregator-Derivatives Adapter for DefiLlama
 * 
 * Tracks perpetual futures volume routed through GroypFi's STORM Trade integration.
 * GroypFi charges a 1% house fee on all perps trades.
 * 
 * Fee wallet: EQAO6fsGZMl8PEAOIeW5-xRBw7tt9fwrLqIijmyPifGwA9lR
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const PERPS_FEE_WALLET = "EQAO6fsGZMl8PEAOIeW5-xRBw7tt9fwrLqIijmyPifGwA9lR";
const HOUSE_FEE_BPS = 100; // 1% house fee on perps trades
const TON_API = "https://tonapi.io/v2";

// Supported trading pairs on GroypFi Perps (via STORM Trade)
const SUPPORTED_PAIRS = [
  // Crypto
  "BTC/USDT", "ETH/USDT", "TON/USDT", "SOL/USDT", "XRP/USDT",
  "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
  "MATIC/USDT", "UNI/USDT", "ATOM/USDT", "LTC/USDT", "BCH/USDT",
  "NEAR/USDT", "APT/USDT", "ARB/USDT", "OP/USDT", "SUI/USDT",
  "PEPE/USDT", "SHIB/USDT", "WIF/USDT", "BONK/USDT", "FLOKI/USDT",
];

interface Transaction {
  hash: string;
  success: boolean;
  utime: number;
  in_msg?: {
    value: number;
    source?: {
      address: string;
    };
    decoded_op_name?: string;
  };
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

const fetchVolume = async (options: FetchOptions) => {
  const { startOfDay, endOfDay } = options;
  
  try {
    // Fetch TON price
    const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
    const ratesResponse: RatesResponse = await httpGet(ratesUrl);
    const tonPriceUSD = ratesResponse.rates?.TON?.prices?.USD || 1.60;
    
    // Fetch transactions to perps fee wallet
    const txUrl = `${TON_API}/blockchain/accounts/${PERPS_FEE_WALLET}/transactions?limit=1000`;
    const txResponse: TransactionsResponse = await httpGet(txUrl);
    
    let dailyVolumeNano = 0n;
    let tradeCount = 0;
    
    if (txResponse.transactions) {
      for (const tx of txResponse.transactions) {
        // Filter by timestamp (within the day)
        if (tx.utime < startOfDay || tx.utime > endOfDay) continue;
        
        // Only count successful transactions
        if (!tx.success) continue;
        
        // Check if this is a fee payment (incoming transfer to fee wallet)
        if (tx.in_msg && tx.in_msg.value > 0) {
          // The house fee is 1% of trade volume
          // So actual trade volume = fee_amount * 100
          const houseFeeNano = BigInt(tx.in_msg.value);
          const estimatedTradeVolume = houseFeeNano * 100n; // Reverse calculate from 1% fee
          
          dailyVolumeNano += estimatedTradeVolume;
          tradeCount++;
        }
      }
    }
    
    // Convert from nanoTON to TON (9 decimals)
    const dailyVolumeTON = Number(dailyVolumeNano) / 1e9;
    const dailyVolumeUSD = dailyVolumeTON * tonPriceUSD;
    
    // Notional volume for perps (with leverage)
    // Average leverage assumption: 10x
    const avgLeverage = 10;
    const dailyNotionalVolumeUSD = dailyVolumeUSD * avgLeverage;
    
    return {
      dailyVolume: dailyVolumeUSD,
      dailyNotionalVolume: dailyNotionalVolumeUSD,
    };
  } catch (error) {
    console.error("Failed to fetch GroypFi perps volume:", error);
    return {
      dailyVolume: 0,
      dailyNotionalVolume: 0,
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
          Volume: "Perpetual futures volume calculated from 1% house fees received. Volume = fee_amount / 0.01",
          NotionalVolume: "Estimated notional volume including leverage (average 10x)",
        },
      },
    },
  },
};

export default adapter;
