import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "A 0.3% fee is charged to users on every swap, 1/6 goes to protocol.",
  SupplySideRevenue: 'There are 5/6 of swap fees goes to liquidity providers.',
  Revenue: 'There are 1/6 goes to protocol.',
  ProtocolRevenue: 'There are 1/6 goes to protocol.',
}

// https://server.saucerswap.finance/api/public/pools/platform-data?field=VOLUME_USD&interval=DAY&from=1650586&&to=1743155400
const historicalVolumeEndpoint = (from: number, to: number) => `https://server.saucerswap.finance/api/public/pools/platform-data?field=VOLUME_USD&interval=DAY&from=${from}&to=${to}`
interface IVolumeItem {
  timestampSeconds: string;
  value: string;
}

const fetch = async (__: number, _: ChainBlocks, { startOfDay }: FetchOptions) => {
  const TwoDays = 2 * 24 * 3600
  const historicalVolume: IVolumeItem[] = (await httpGet(historicalVolumeEndpoint(startOfDay - TwoDays, startOfDay + TwoDays), {
    headers: {
      'origin': 'https://www.saucerswap.finance',
    }
  }));

  const _dailyVolume = historicalVolume
    .find((dayItem: any) => Number(dayItem.timestampSeconds) === startOfDay)?.value

  const dailyVolume = Number(_dailyVolume ? _dailyVolume : 0)

  // https://docs.saucerswap.finance/protocol/saucerswap-v1
  // v1 charges fee 0.3% per swap, 5/6 goes to LP, 1/6 goes to protocol
  const dailyFees = dailyVolume * 0.003
  const dailyRevenue = dailyFees * 1 / 6
  const dailySupplySideRevenue = dailyFees * 5 / 6

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
    },
  },
  methodology,
};

export default adapter;
