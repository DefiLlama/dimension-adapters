import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolume } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x633a093C9e94f64500FC8fCBB48e90dd52F6668F'

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  return getDexVolume({ chain: CHAIN.METIS, fromTimestamp, toTimestamp, factory: FACTORY_ADDRESS, timestamp })
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.METIS]: {
      fetch,
      start: async () => 1670544000,
    },
  }
};

export default adapter;
