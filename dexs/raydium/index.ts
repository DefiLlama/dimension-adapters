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
  tvl: number;
}

const graphs = async (timestamp: number): Promise<FetchResultVolume> => {
  const ammPool: IAmmPoool = (await fetchURL(urlAmmPool));
  const ammPoolStandard: any[] = (await fetchURL(urlAmmPoolStandard)).data;;
  const ammPoolStandardVolume: IAmmPooolStandar[] = ammPoolStandard.map((e: any) => e.day);
  const dailyVolumeAmmPool = ammPoolStandardVolume
    .filter((e: IAmmPooolStandar) => e.tvl > 100_000)
    .reduce((a: number, b: IAmmPooolStandar) => a + b.volume, 0)
  const dailyVolume = ammPool?.volume24h ? ammPool?.volume24h + dailyVolumeAmmPool: undefined;
  const fiveBill = 3_000_000_000; // set the threshold to 3B

  return {
    dailyVolume: dailyVolume ? `${dailyVolume < fiveBill ? dailyVolume : undefined}`: undefined,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch: graphs,
      // runAtCurrTime: true,
      customBackfill: undefined,
      start: 1660521600,
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
