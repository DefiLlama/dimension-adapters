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

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const SWAP_REFERRER = "0:eee00893fff24abaa4f466789ed11a172103cf723e2e206619999edd42b8845944";
const TON_API = "https://tonapi.io/v2";

const fetchVolume = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  try {
    const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
    const ratesResponse = await httpGet(ratesUrl);
    const tonPriceUSD = ratesResponse.rates?.TON?.prices?.USD || 3.50;
    
    const txUrl = `${TON_API}/blockchain/accounts/${SWAP_REFERRER}/transactions?limit=1000&start_date=${startTimestamp}&end_date=${endTimestamp}`;
    const txResponse = await httpGet(txUrl);
    
    let dailyVolumeNano = 0n;
    
    if (txResponse.transactions) {
      for (const tx of txResponse.transactions) {
        if (!tx.success) continue;
        if (tx.in_msg && tx.in_msg.value > 0) {
          const referralFeeNano = BigInt(tx.in_msg.value);
          const estimatedSwapVolume = referralFeeNano * 100n;
          dailyVolumeNano += estimatedSwapVolume;
        }
      }
    }
    
    const dailyVolumeTON = Number(dailyVolumeNano) / 1e9;
    const dailyVolumeUSD = dailyVolumeTON * tonPriceUSD;
    
    return {
      dailyVolume: dailyVolumeUSD,
    };
  } catch (error) {
    console.error("Failed to fetch GroypFi DEX volume:", error);
    return { dailyVolume: 0 };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch: fetchVolume,
      start: 1735689600,
      meta: {
        methodology: {
          Volume: "DEX aggregation volume calculated from 1% referral fees. Volume = fee_amount * 100",
        },
      },
    },
  },
};

export default adapter;
