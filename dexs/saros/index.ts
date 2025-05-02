import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { postURL } from "../../utils/fetchURL"

async function fetch() {
  const { data: { data } } = await postURL('https://api.saros.xyz/api/saros/token/top', {
    "page": 1,
    "size": 100,
  })

  const dailyVolume = data.reduce((acc: number, { volume24h }) => acc + Number(volume24h), 0);
  return { dailyVolume }
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
