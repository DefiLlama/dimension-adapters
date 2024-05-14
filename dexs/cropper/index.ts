import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';


const cropperEndpoint = "https://flow.cropper.finance/stats24.json";

interface Stats24H {
  dailyVolume: number
  dailyFees: number
  details: number
  timestamp: number
};

async function fetch(timestamp: any) {
  let response: Stats24H = await httpGet(cropperEndpoint);
  return {
    dailyVolume: response.dailyVolume,
    timestamp: timestamp
  };
}

export default {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            runAtCurrTime: true,
            start: 1714435200, 
        }
    }
}
