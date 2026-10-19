import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

interface IDeriVolumeResponse {
  daily_volume: string;
  daily_volume_premium: string;
  chain_id?: number;
}

const CHAIN_IDS: Partial<Record<CHAIN, number>> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.BSC]: 56,
  [CHAIN.SONIC]: 146,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.BASE]: 8453,
  [CHAIN.LINEA]: 59144,
  [CHAIN.ROBINHOOD]: 4663,
  [CHAIN.SOLANA]: 501,
};

// endTime is in seconds (unix). API also accepts ms / ns.
export const deriVolumeEndpoint = (endTime: number, chainId: number) => {
  return `https://v5dh.deri.io/statistics?instrument_type=OPTION&end_time=${endTime}&chain_id=${chainId}`;
}

const fetchDeriVolumeData = (chainId: number) => async (options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(options.toTimestamp);
  const deriVolumeData = await getDeriVolumeData(deriVolumeEndpoint(dayTimestamp, chainId));

  const dailyNotionalVolume = Number(deriVolumeData.daily_volume).toFixed(2);
  const dailyPremiumVolume = Number(deriVolumeData.daily_volume_premium).toFixed(2);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

async function getDeriVolumeData(endpoint: string): Promise<IDeriVolumeResponse> {
  return (await fetchURL(endpoint));
}

const adapter: SimpleAdapter = {
  adapter: Object.fromEntries(
    Object.entries(CHAIN_IDS).map(([chain, chainId]) => [
      chain,
      {
        fetch: fetchDeriVolumeData(chainId as number),
        start: '2026-04-20',
      },
    ])
  ),
};

export default adapter;
