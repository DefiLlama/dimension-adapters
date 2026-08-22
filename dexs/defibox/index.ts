import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { httpPost } from "../../utils/fetchURL";

const endpoint = (chain: string) => `https://${chain}.defibox.io/api/swap/get24HInfo`
const bal_endpoint = "https://eos.defibox.io/api/bal/get24HInfo"

interface IVolume {
  volume_usd_24h: string;
}
const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  let volume = 0
  if (chain === CHAIN.EOS) {
    const bal_reponse: IVolume = (await fetchURL(bal_endpoint))?.data
    const swap_response: IVolume = (await fetchURL(endpoint(chain)))?.data
    volume = (bal_reponse?.volume_usd_24h ? Number(bal_reponse.volume_usd_24h) : 0) + (swap_response?.volume_usd_24h ? Number(swap_response.volume_usd_24h) : 0)
  } else {
    const response: IVolume = chain !== CHAIN.BSC ? (await fetchURL(endpoint(chain)))?.data : (await httpPost(endpoint(chain), {}, { headers: { chainid: 56 } })).data;
    volume = response?.volume_usd_24h ? Number(response.volume_usd_24h) : 0
  }

  return {
    dailyVolume: volume,
  };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.EOS, CHAIN.WAX],
  start: '2023-01-22',
  runAtCurrTime: true,
};

export default adapter;
