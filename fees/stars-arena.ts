import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

interface IFee {
  day: string;
  fees_usd: number;
  rev_usd: number;
}

const temp: IFee[] = [
  {
    day: '2023-09-30 00:00:00.000 UTC',
    fees_usd: 13414.972766868883,
    rev_usd: 2682.9945533737764
  },
  {
    day: '2023-09-26 00:00:00.000 UTC',
    fees_usd: 11021.596894875598,
    rev_usd: 2204.3193789751194
  },
  {
    day: '2023-09-23 00:00:00.000 UTC',
    fees_usd: 828.1602036458277,
    rev_usd: 165.63204072916554
  },
  {
    day: '2023-09-21 00:00:00.000 UTC',
    fees_usd: 11.914631625000027,
    rev_usd: 2.3829263250000055
  },
  {
    day: '2023-09-28 00:00:00.000 UTC',
    fees_usd: 14598.780457770625,
    rev_usd: 2919.756091554125
  },
  {
    day: '2023-10-06 00:00:00.000 UTC',
    fees_usd: 139593.08623694192,
    rev_usd: 27918.61724738838
  },
  {
    day: '2023-09-20 00:00:00.000 UTC',
    fees_usd: 0.1363260416666671,
    rev_usd: 0.02726520833333342
  },
  {
    day: '2023-09-22 00:00:00.000 UTC',
    fees_usd: 0.1827763611111108,
    rev_usd: 0.036555272222222164
  },
  {
    day: '2023-10-03 00:00:00.000 UTC',
    fees_usd: 266255.0058238868,
    rev_usd: 53251.00116477736
  },
  {
    day: '2023-10-02 00:00:00.000 UTC',
    fees_usd: 49775.03070912491,
    rev_usd: 9955.006141824982
  },
  {
    day: '2023-09-29 00:00:00.000 UTC',
    fees_usd: 13817.619084208302,
    rev_usd: 2763.5238168416604
  },
  {
    day: '2023-09-25 00:00:00.000 UTC',
    fees_usd: 3038.7214484722117,
    rev_usd: 607.7442896944424
  },
  {
    day: '2023-10-01 00:00:00.000 UTC',
    fees_usd: 18424.2631963534,
    rev_usd: 3684.8526392706804
  },
  {
    day: '2023-10-05 00:00:00.000 UTC',
    fees_usd: 210307.60343831958,
    rev_usd: 42061.52068766391
  },
  {
    day: '2023-09-27 00:00:00.000 UTC',
    fees_usd: 7569.906683250134,
    rev_usd: 1513.9813366500268
  },
  {
    day: '2023-09-24 00:00:00.000 UTC',
    fees_usd: 1922.3830129166604,
    rev_usd: 384.47660258333207
  },
  {
    day: '2023-10-04 00:00:00.000 UTC',
    fees_usd: 365731.42286171776,
    rev_usd: 73146.28457234355
  }
]

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  try {
    const fees: IFee[] = (await queryDune("3083702"));
    // const fees = temp;
    const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];
    const daily = fees.find((e: IFee) => e.day.split(' ')[0] === dateStr);
    const dailyFees = daily?.fees_usd || 0;
    const dailyRevenue = daily?.rev_usd || 0;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (e) {
    console.error(e)
    throw e;
  }

}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: async () => 1695081600,
    }
  }
}

export default adapters;
