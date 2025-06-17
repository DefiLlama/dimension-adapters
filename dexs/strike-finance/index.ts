import axios from "axios";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";


export async function fetch(options: FetchOptions) {
  const {
    data: { dailyVolume },
  } = await axios.get(
    `https://tidelabs.io:2121/defillama/strike-finance/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );
  const dailyVolumeUSD = options.createBalances();
  dailyVolumeUSD.addCGToken('cardano', Number(dailyVolume));

  return {
    dailyVolume
  };
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2025-05-16',
    },
  },
};

export default adapter;
