import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

import { httpGet } from "../utils/fetchURL"

async function fetch() {
  const { data: { data } } = await httpGet('https://api.saros.xyz/adapters/saros/pool/filter?page=1&size=100&sort=volume24h&type=top')

  const dailyVolume = data.reduce((acc: number, { volume24h }: any) => acc + Number(volume24h), 0);
  const dailyFees = data.reduce((acc: number, { fee24h }: any) => acc + Number(fee24h), 0);
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
