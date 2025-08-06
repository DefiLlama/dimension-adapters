import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (timestamp: number) => {
  const res = await fetchURL(`https://api.etaswap.com/v1/statistics/volume/total?timestamp=${timestamp}`);

  return {
    dailyVolume: Number(res.volume_USD_24h) / 100,
    dailyFees: Number(res.fee_USD_24h) / 100
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
