import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const SWAP_REFERRER = "0:eee00893fff24abaa4f466789ed11a172103cf723e2e206619999edd42b8845944";
const TON_API = "https://tonapi.io/v2";

const fetchVolume = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  const ratesResponse = await httpGet(`${TON_API}/rates?tokens=ton&currencies=usd`);
  const tonPriceUSD = ratesResponse.rates?.TON?.prices?.USD || 3.50;
  
  const txResponse = await httpGet(`${TON_API}/blockchain/accounts/${SWAP_REFERRER}/transactions?limit=1000`);
  
  let dailyVolumeNano = 0n;
  
  for (const tx of txResponse.transactions || []) {
    if (tx.utime < startTimestamp || tx.utime > endTimestamp) continue;
    if (!tx.success) continue;
    if (tx.in_msg?.value > 0) {
      dailyVolumeNano += BigInt(tx.in_msg.value) * 100n;
    }
  }
  
  const dailyVolumeUSD = (Number(dailyVolumeNano) / 1e9) * tonPriceUSD;
  
  return { dailyVolume: dailyVolumeUSD };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch: fetchVolume,
      start: 1735689600,
    },
  },
};

export default adapter;
