import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async ({ startTimestamp }: { startTimestamp: number }) => {
  const response = await fetch(
    `https://grelfswap.com/api/defillama/volume?startTimestamp=${startTimestamp}`
  );
  const data = await response.json();
  return {
    dailyVolume: data.dailyVolumeUsd,
    totalVolume: data.totalVolumeUsd,
    timestamp: startTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: 1762473600,
    },
  },
};

export default adapter;
