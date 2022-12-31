// import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { AnalyticsData, Position, StrategyType } from "./interfaces";

const endpoints: { [chain: string]: string } = {
  arbitrum: "https://api.hegic.co/analytics",
};

const hegicHergeStart = dateStringToTimestamp("2022-10-24T11:21:45Z"); // taken from the first purchased option
const secondsInADay = 24 * 60 * 60;

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: createFetchFn(endpoints[chain]),
        start: async () => hegicHergeStart,
      },
    };
  }, {}),
};

function createFetchFn(endpoint: string) {
  return async (timestamp: number) => {
    const analyticsData = await getAnalyticsData(endpoint);

    const allPositions = [
      //
      ...analyticsData.positions.active,
      ...analyticsData.positions.closed,
    ];

    const dailyPositions = getPositionsForDaily(allPositions, timestamp);

    const dailyNotionalVolume = getNotionalVolumeUSD(dailyPositions);
    const dailyPremiumVolume = getPremiumVolumeUSD(dailyPositions);
    const totalNotionalVolume = getNotionalVolumeUSD(allPositions);
    const totalPremiumVolume = getPremiumVolumeUSD(allPositions);

    return {
      dailyNotionalVolume,
      dailyPremiumVolume,
      totalNotionalVolume,
      totalPremiumVolume,
    };
  };
}

async function getAnalyticsData(endpoint: string): Promise<AnalyticsData> {
  return (await fetchURL(endpoint))?.data;
}

function getPositionsForDaily(positions: Position[], fromTimestamp: number) {
  const from = fromTimestamp;
  const to = from + secondsInADay;

  return positions.filter((position) => {
    const purchaseTimestamp = dateStringToTimestamp(position.purchaseDate);
    return purchaseTimestamp >= from && purchaseTimestamp < to;
  });
}

function dateStringToTimestamp(dateString: string) {
  return new Date(dateString).getTime() / 1000;
}

function getPremiumVolumeUSD(positions: Position[]) {
  return positions
    .map((position) => position.premiumPaid)
    .reduce((sumPremium, positionPremium) => sumPremium + positionPremium, 0);
}

function getNotionalVolumeUSD(positions: Position[]) {
  return positions
    .map(
      (position) =>
        position.amount *
        position.spotPrice *
        StrategyVolumeCoefficients[position.type]
    )
    .reduce((sumVolume, positionVolume) => sumVolume + positionVolume, 0);
}

/** Coefficients for multiplying plain volume,
 *  to reflect the number of options that are
 *  bought as part of the strategy. */
const StrategyVolumeCoefficients = {
  [StrategyType.CALL]: 1,
  [StrategyType.PUT]: 1,
  [StrategyType.STRIP]: 3,
  [StrategyType.STRAP]: 3,
  [StrategyType.STRADDLE]: 2,
  [StrategyType.STRANGLE]: 2,
  [StrategyType.LongCondor]: 4,
  [StrategyType.LongButterfly]: 4,
  [StrategyType.BearCallSpread]: 2,
  [StrategyType.BearPutSpread]: 2,
  [StrategyType.BullCallSpread]: 2,
  [StrategyType.BullPutSpread]: 2,
};

export default adapter;
