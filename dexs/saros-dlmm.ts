import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

import { httpGet } from "../utils/fetchURL"

async function fetch() {
  const { data: { data } } = await httpGet('https://api.saros.xyz/api/dex-v3/pool?size=99&order=-volume24h&page=1')

  const dailyVolume = data.reduce((acc: number, { volume24h }: any) => acc + Number(volume24h), 0);
  const dailyFees = data.reduce((acc: number, { fees24h }: any) => acc + Number(fees24h), 0);
  return { dailyVolume, dailyFees, }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};
export default adapter;
