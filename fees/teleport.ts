/**
 * TelePort DEX Adapter for DefiLlama
 * 
 * Tracks swap volume routed through TelePort's STON.fi integration.
 * TelePort earns 1% referral fees on swaps via referrer address:
 * UQBm8ymVzwplJBaQRIjbMwN5yoibCs039I7aXdAfuUfHLlZa
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const REFERRER_ADDRESS = "UQBm8ymVzwplJBaQRIjbMwN5yoibCs039I7aXdAfuUfHLlZa";
const REFERRAL_FEE_BPS = 100; // 1%
const TON_API = "https://tonapi.io/v2";

interface Transaction {
  hash: string;
  lt: string;
  account: {
    address: string;
  };
  success: boolean;
  utime: number;
  in_msg?: {
    value: number;
    source?: {
      address: string;
    };
    decoded_op_name?: string;
    decoded_body?: {
      amount?: string;
      token_amount?: string;
    };
  };
  out_msgs?: Array<{
    value: number;
    destination?: {
      address: string;
    };
    decoded_op_name?: string;
  }>;
  total_fees: number;
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { startOfDay } = options;
  const endOfDay = startOfDay + (24 * 60 * 60);

  // Fetch TON price
  const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
  const ratesResponse: RatesResponse = await httpGet(ratesUrl);
  const tonPriceUSD = ratesResponse.rates?.TON?.prices?.USD || 1.60;

  // Fetch transactions for our referrer address
  const txUrl = `${TON_API}/blockchain/accounts/${REFERRER_ADDRESS}/transactions?limit=1000`;
  const txResponse: TransactionsResponse = await httpGet(txUrl);
  console.log(txUrl);
  console.log(txResponse);

  let dailyVolumeNano = 0n;
  let swapCount = 0;

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

  // Convert from nanoTON to TON (9 decimals)
  const dailyVolumeTON = Number(dailyVolumeNano) / 1e9;
  const dailyVolumeUSD = dailyVolumeTON * tonPriceUSD;

  // Fees are the referral payments received
  const dailyFeesUSD = dailyVolumeUSD * REFERRAL_FEE_BPS / 10000;
  const dailyRevenueUSD = dailyFeesUSD; // All referral fees go to TelePort

  return {
    dailyVolume: dailyVolumeUSD,
    dailyFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
    dailyUserFees: dailyFeesUSD,
    dailyProtocolRevenue: dailyRevenueUSD,
  };
};

const adapter: SimpleAdapter = {
  chains: [CHAIN.TON],
  fetch,
  start: '2024-12-01', // December 1, 2024 - TelePort launch date (adjust as needed)
  methodology: {
    Volume: "Swap volume calculated from referral fees received at TelePort's referrer address",
    Fees: "1% referral fee on all swaps routed through TelePort",
    Revenue: "100% of referral fees go to TelePort protocol",
  },
};

export default adapter;
