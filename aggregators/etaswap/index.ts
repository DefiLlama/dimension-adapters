import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetchLogs = async (timestamp: number) => {
  const res = await httpGet(`https://api.etaswap.com/v1/statistics/volume/total?timestamp=${timestamp}`);
  return {
    dailyVolume: new BigNumber(res.volume_USD_24h).div(100).toFixed(2),
    totalVolume: new BigNumber(res.volume_USD_total).div(100).toFixed(2),
    dailyFees: new BigNumber(res.fee_USD_24h).div(100).toFixed(2),
    totalFees: new BigNumber(res.fee_USD_total).div(100).toFixed(2),
    timestamp: timestamp,
  };
};

const adapter: any = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch: fetchLogs,
      start: 1709395559,
    },
  },
};

export default adapter;
