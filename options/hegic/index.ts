// import { Chain } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { AnalyticsData, Position, StrategyType } from "./interfaces";

export const analyticsEndpoint = "https://api.hegic.co/positions";
export const HEGIC_HERGE_START = dateStringToTimestamp("2022-10-24T11:21:45Z"); // taken from the first purchased option

const secondsInADay = 24 * 60 * 60;

/** Returns the earliest timestamp for which the data are available */
export async function getEarliestAvailableTimestamp() {
  return HEGIC_HERGE_START + secondsInADay;
}

const adapter: SimpleAdapter = {
  adapter: {
    arbitrum: {
      runAtCurrTime: true,
      fetch: fetchArbitrumAnalyticsData,
      start: getEarliestAvailableTimestamp,
    },
  },
};

export async function fetchArbitrumAnalyticsData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  const analyticsData = await getAnalyticsData(analyticsEndpoint);

  const allPositions = [
    ...analyticsData.positions,
  ];

  const dailyPositions = getPositionsForDaily(allPositions, timestamp);

  const dailyNotionalVolume = getNotionalVolumeUSD(dailyPositions).toFixed(2);
  const dailyPremiumVolume = getPremiumVolumeUSD(dailyPositions).toFixed(2);

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

async function getAnalyticsData(endpoint: string): Promise<AnalyticsData> {
  return (await fetchURL(endpoint));
}

function getPositionsForDaily(
  positions: Position[],
  endOfDayTimestamp: number
) {
  const from = endOfDayTimestamp - secondsInADay;
  const to = endOfDayTimestamp;
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
        position.amountUsd //amountUsd is equal to amount * spotprice * strategy coefficient
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
