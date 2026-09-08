import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

interface IDayStats {
  label: string;
  volumeHBAR: string;
  volumeUSD: string;
  poolFeeHBAR: string;
  poolFeeUSD: string;
}

const fetch = async (options: FetchOptions) => {
  // values are returned in cents of USD
  const res: IDayStats[] = await fetchURL('https://api.etaswap.com/v1/statistics/volume');
  const dayStats = res.find((item) => item.label === options.dateString);
  if (!dayStats) throw new Error(`EtaSwap: no stats found for ${options.dateString}`);

  return {
    dailyVolume: Number(dayStats.volumeUSD) / 100,
    dailyFees: Number(dayStats.poolFeeUSD) / 100
  };

};

const adapter: any = {
  start: '2024-03-02',
  fetch,
  chains: [CHAIN.HEDERA],
  methodology: {
    Volume: 'Total token swap volume',
    Fees: 'Total swap fees paid by users',
  }
};

export default adapter;
