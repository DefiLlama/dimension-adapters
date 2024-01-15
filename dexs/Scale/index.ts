import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolume } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04';

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  return getDexVolume({ chain: CHAIN.BASE, fromTimestamp, toTimestamp, factory: FACTORY_ADDRESS, timestamp })
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: async () => 1695458888,
    },
  }
};

export default adapter;
