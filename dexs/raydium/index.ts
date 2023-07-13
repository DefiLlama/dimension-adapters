import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";

import fetchURL from "../../utils/fetchURL"

const urlAmmPool = "https://api.raydium.io/v2/main/info";
const urlAmmPoolStandard = "https://api.raydium.io/v2/ammV3/ammPools"

interface IAmmPoool {
  totalvolume: string;
  volume24h: number;
}
interface IAmmPooolStandar {
  volume: number;
}
const graphs = async (timestamp: number): Promise<FetchResultVolume> => {
  const ammPool: IAmmPoool = (await fetchURL(urlAmmPool)).data;
  const ammPoolStandard: any[] = (await fetchURL(urlAmmPoolStandard)).data.data;;
  const ammPoolStandardVolume: IAmmPooolStandar[] = ammPoolStandard.map((e: any) => e.day);
  const dailyVolumeAmmPool = ammPoolStandardVolume.reduce((a: number, b: IAmmPooolStandar) => a + b.volume, 0)

  return {
    dailyVolume:  ammPool?.volume24h ? `${ammPool?.volume24h + dailyVolumeAmmPool}`: undefined,
    // totalVolume:  ammPool?.totalvolume ? `${ammPool?.totalvolume}`: undefined,
    timestamp: timestamp
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch: graphs,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 0,
    },
    // TODO custom backfill
  },
};

export default adapter;

/*
    backfill steps

    1. https://api.raydium.io/pairs
    call all pairs

    2. for each pair use amm_id

    3. query rayqlbeta2.aleph.cloud for each pair and sum for respective dates

    {
    pool_hourly_data(address: "GaqgfieVmnmY4ZsZHHA6L5RSVzCGL3sKx4UgHBaYNy8m", skip: 10) {
        volume_usd
        time
    }
    }
*/
