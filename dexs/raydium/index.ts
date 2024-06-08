import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL"

const graphs = async (timestamp: number): Promise<FetchResultVolume> => {
  const ammPoolStandard: any[] = (await fetchURL("https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=default&sortType=desc&pageSize=100&page=1")).data.data;
  const dailyVolumeAmmPool = ammPoolStandard
    .filter((e) => e.tvl > 100_000)
    .reduce((a: number, b) => a + b.day.volume, 0)
  const fiveBill = 3_000_000_000; // set the threshold to 3B

  return {
    dailyVolume: `${dailyVolumeAmmPool < fiveBill ? dailyVolumeAmmPool : undefined}`,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch: graphs,
      runAtCurrTime: true,
      start: 1660521600,
    },
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
