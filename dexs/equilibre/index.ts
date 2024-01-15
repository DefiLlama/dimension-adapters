import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolume } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xA138FAFc30f6Ec6980aAd22656F2F11C38B56a95'

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  return getDexVolume({ chain: CHAIN.KAVA, fromTimestamp, toTimestamp, factory: FACTORY_ADDRESS, timestamp })
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KAVA]: {
      fetch,
      start: async () => 1677888000,
    },
  }
};

export default adapter;
