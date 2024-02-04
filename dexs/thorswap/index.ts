import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://midgard.ninerealms.com/v2/history/swaps?interval=day&count=400"

interface IVolumeall {
  totalFees: string;
  toAssetFees: string;
  runePriceUSD: string;
  synthRedeemFees: string;
  synthMintFees: string;
  toRuneFees: string;
  totalVolume: string;
  startTime: string;
  toRuneVolume: string;
}

const calVolume = (total: IVolumeall): number => {
  const runePriceUSD = Number(total?.runePriceUSD || 0);
  const volume = Number(total.totalVolume || 0) / 1e8 * runePriceUSD
  return volume;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint, { headers: {"x-client-id": "defillama"}})).intervals;
  const totalVolume = historicalVolume
    .filter(volItem => Number(volItem.startTime) <= dayTimestamp)
    .reduce((acc, res) => acc + calVolume(res), 0);
  const dailyVolumeCall = historicalVolume.find((dayItem: IVolumeall) => Number(dayItem.startTime) === dayTimestamp);
  const dailyVolume = calVolume(dailyVolumeCall as IVolumeall);

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.THORCHAIN]: {
      fetch,
      start: 1662508800,
    },
  },
};

export default adapter;
