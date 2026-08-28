import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
  const totalVolume = (await httpGet(`https://api.dipcoin.io/api/index/stats/line`))?.data?.[0]?.volume
  const pools = (await httpGet("https://api.dipcoin.io/api/pools"))?.data;
  let spotFees = 0;
  for (const pool of pools) {
    spotFees += Number(pool.fee24h);
  }

  return {
    dailyFees: spotFees,
    dailyVolume: totalVolume,
  };
};


const adapter: SimpleAdapter = {
  adapter:{
    [CHAIN.SUI]:{
      fetch: fetch,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Fees: 'Spot trading fees paid by users',
  }
};

export default adapter;
