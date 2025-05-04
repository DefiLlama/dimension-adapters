import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { nullAddress } from "../helpers/token";
import { httpGet } from "../utils/fetchURL";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, runAtCurrTime: true },
  },
  version: 2,
};
export default adapters;

const routes: any = {
  [CHAIN.ETHEREUM]: 'https://eth-mainnet-api.ekubo.org/overview/volume',
}

async function fetch(options: FetchOptions) {
  const { chain } = options;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const { volumeByToken_24h } = await httpGet(routes[chain]);
  volumeByToken_24h.map((t: any) => {
    let token = BigInt(t.token).toString(16);
    if (t.token === '0') token = nullAddress
    else token = '0x' + token
    dailyFees.add(token, t.fees);
    dailyVolume.add(token, t.volume);
  })

  return { dailyFees, dailyVolume };

}