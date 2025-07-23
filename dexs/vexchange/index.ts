import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.vexchange.io/v1/pairs"

interface IVolumeall {
  token0Volume: number;
  token1Volume: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: any = (await fetchURL(historicalVolumeEndpoint));
  const prespose: IVolumeall[] = Object.keys(historicalVolume).map((key: string) => {
    const {token0Volume, token1Volume, token0, token1, price} = historicalVolume[key];
    return {
      token0Volume: Number(token0Volume || 0) * Number(token0?.usdPrice || 0),
      token1Volume: Number(token1Volume || 0) * Number(token1?.usdPrice || 0),
    } as IVolumeall
  });
  const dailyVolume = prespose
    .reduce((a: number, b: IVolumeall) => a + Number(b.token0Volume)+ Number(b.token1Volume), 0);

  return {
    dailyVolume: dailyVolume ? `${dailyVolume / 2}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.VECHAIN]: {
      fetch,
      start: '2023-01-16',
      runAtCurrTime: true
    },
  },
};

export default adapter;
