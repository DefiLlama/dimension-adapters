import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "A 0.3% fee is charged to users on every swap, 5/6 goes to liquidity providers, 1/6 goes to protocol.",
}

const historicalVolumeEndpoint = (to: number) => `https://server.saucerswap.finance/api/public/pools/platform-data?field=VOLUME_USD&interval=DAY&from=1650586&to=${to}`
// https://server.saucerswap.finance/api/public/pools/platform-data?field=VOLUME_USD&interval=DAY&from=1650586&&to=1743155400
interface IVolumeItem {
  timestampSeconds: string;
  value: string;
}

const fetch = async (timestamp: number , _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
  const historicalVolume: IVolumeItem[] = (await httpGet(historicalVolumeEndpoint(new Date().getTime() / 1000), { headers: {
    'origin': 'https://www.saucerswap.finance',
  }}));

  const _dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.timestampSeconds) === startOfDay)?.value

  const _dailyVolumeUsd = Number(_dailyVolume ? _dailyVolume : 0)

  // https://docs.saucerswap.finance/protocol/saucerswap-v1
  // v1 charges fee 0.3% per swap, 5/6 goes to LP, 1/6 goes to protocol
  const _dailyFeesUsd = _dailyVolumeUsd * 0.003
  const _dailyRevenueUsd = _dailyFeesUsd * 1/6

  const dailyVolume = createBalances()
  dailyVolume.addUSDValue(_dailyVolume)

  const dailyFees = createBalances()
  dailyFees.addUSDValue(_dailyFeesUsd)

  const dailyRevenue = createBalances()
  dailyRevenue.addUSDValue(_dailyRevenueUsd)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
