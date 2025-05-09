import { request } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_URL = 'https://statistic-api.ashperp.trade/graphql';


const VolumeQuery = `
query getVolume {
  overview {
    getPrevious24h {
      volume_24h
    }
  }
}
`

const fetch = async () => {
  const dailyVolume: number = (await request(API_URL, VolumeQuery)).overview.getPrevious24h.volume_24h;
  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ELROND]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-02-13'
    },
  },
};

export default adapter;
