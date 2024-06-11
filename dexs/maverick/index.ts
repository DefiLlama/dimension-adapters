//  Maverick v1 volume
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolumeV1, maverickV1Factories } from "./maverick-v1";
import { fetchVolumeV2, maverickV2Factories } from "./maverick-v2";

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
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
    v2: {
      [CHAIN.BSC]: {
        fetch: fetchVolumeV2(),
        start: maverickV2Factories[CHAIN.BSC].startTimestamp,
      },
      [CHAIN.BASE]: {
        fetch: fetchVolumeV2(),
        start: maverickV2Factories[CHAIN.BASE].startTimestamp,
      },
      [CHAIN.ERA]: {
        fetch: fetchVolumeV2(),
        start: maverickV2Factories[CHAIN.ERA].startTimestamp,
      },
      [CHAIN.ETHEREUM]: {
        fetch: fetchVolumeV2(),
        start: maverickV2Factories[CHAIN.ETHEREUM].startTimestamp,
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetchVolumeV2(),
        start: maverickV2Factories[CHAIN.ARBITRUM].startTimestamp,
      },
    },
  },
};

export default adapter;
