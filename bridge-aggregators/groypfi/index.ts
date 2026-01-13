/**
 * GroypFi Bridge Aggregator Adapter for DefiLlama
 * 
 * Tracks cross-chain swap volume routed through GroypFi's SimpleSwap integration.
 * Widget ID: 95e2629f-e39b-4d91-8427-cdbe61f36133
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const FEE_WALLET = "0:eee00893fff24abaa4f466789ed11a172103cf723e2e206619999edd42b8845944";
const TON_API = "https://tonapi.io/v2";

const fetchVolume = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  try {
    const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
    const ratesResponse = await httpGet(ratesUrl);
    const tonPriceUSD = ratesResponse.rates?.TON?.prices?.USD || 3.50;
    
    const txUrl = `${TON_API}/blockchain/accounts/${FEE_WALLET}/transactions?limit=1000&start_date=${startTimestamp}&end_date=${endTimestamp}`;
    const txResponse = await httpGet(txUrl);
    
    let dailyVolumeNano = 0n;
    
    if (txResponse.transactions) {
      for (const tx of txResponse.transactions) {
        if (!tx.success) continue;
        if (tx.in_msg && tx.in_msg.value > 0) {
          const feeNano = BigInt(tx.in_msg.value);
          const estimatedVolume = feeNano * 200n;
          dailyVolumeNano += estimatedVolume;
        }
      }
    }
    
    const dailyVolumeTON = Number(dailyVolumeNano) / 1e9;
    const dailyVolumeUSD = dailyVolumeTON * tonPriceUSD;
    
    return {
      dailyBridgeVolume: dailyVolumeUSD,
    };
  } catch (error) {
    console.error("Failed to fetch GroypFi bridge volume:", error);
    return { dailyBridgeVolume: 0 };
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
          Volume: "Cross-chain swap volume via SimpleSwap integration. Estimated from fees (0.5% affiliate fee).",
        },
      },
    },
  },
};

export default adapter;
