//  Maverick v1 volume
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolumeV1, maverickV1Factories } from "./maverick-v1";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolumeV1(),
      start: maverickV1Factories[CHAIN.BSC].startTimestamp,
    },
    [CHAIN.BASE]: {
      fetch: fetchVolumeV1(),
      start: maverickV1Factories[CHAIN.BASE].startTimestamp,
    },
    [CHAIN.ERA]: {
      fetch: fetchVolumeV1(),
      start: maverickV1Factories[CHAIN.ERA].startTimestamp,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolumeV1(),
      start: maverickV1Factories[CHAIN.ETHEREUM].startTimestamp,
    },
  },
};

export default adapter;
