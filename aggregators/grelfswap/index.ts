import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchVolume = async ({ startTimestamp }: { startTimestamp: number }) => {
  const response = await globalThis.fetch(
    `https://grelfswap.com/api/defillama/volume?startTimestamp=${startTimestamp}`
  );
  const data = await response.json();
  return {
    dailyVolume: data.dailyVolumeUsd,
    timestamp: startTimestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HEDERA]: {
      fetch: fetchVolume,
      start: 1762473600,
    },
  },
};

export default adapter;
