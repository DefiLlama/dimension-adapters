import axios from "axios"
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";

const fetchLogs = async (timestamp: number) => {
  const res = await axios.get(`https://api.etaswap.com/v1/statistics/volume/total?timestamp=${timestamp}`);
  return {
    dailyVolume: new BigNumber(res.data.volume_USD_24h).div(100).toFixed(2),
    totalVolume: new BigNumber(res.data.volume_USD_total).div(100).toFixed(2),
    dailyFees: new BigNumber(res.data.fee_USD_24h).div(100).toFixed(2),
    totalFees: new BigNumber(res.data.fee_USD_total).div(100).toFixed(2),
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
