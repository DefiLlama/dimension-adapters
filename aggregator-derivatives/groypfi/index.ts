import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const PERPS_FEE_WALLET = "0:00e9fb06648978c0402e21e5b9fb1441c3bb6df5fc2b2ea2228e6c8f89f1b003";
const TON_API = "https://tonapi.io/v2";

const fetchVolume = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  const ratesResponse = await httpGet(`${TON_API}/rates?tokens=ton&currencies=usd`);
  const tonPriceUSD = ratesResponse.rates?.TON?.prices?.USD || 3.50;
  
  const txResponse = await httpGet(`${TON_API}/blockchain/accounts/${PERPS_FEE_WALLET}/transactions?limit=1000`);
  
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
