import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolume } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xCe9240869391928253Ed9cc9Bcb8cb98CB5B0722';


const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  return getDexVolume({ chain: 'arbitrum', fromTimestamp, toTimestamp, factory: FACTORY_ADDRESS, timestamp })
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: async () => 1679702400,
    },
  }
};

export default adapter;
