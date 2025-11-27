import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const apiBaseURL = "https://api.makenow.meme/trades/volume";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const totalVolume = options.createBalances();

  const dailyVolumeResponse = await fetchURL(`${apiBaseURL}?fromTs=${options.fromTimestamp}&toTs=${options.toTimestamp}`);
  const totalVolumeResponse = await fetchURL(`${apiBaseURL}`);

  totalVolume.addUSDValue(Number(totalVolumeResponse.volume));
  dailyVolume.addUSDValue(Number(dailyVolumeResponse.volume));

  return {
    totalVolume,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  start: 1735689600, // 2025-01-01 00:00:00 UTC
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
};

export default adapter;

