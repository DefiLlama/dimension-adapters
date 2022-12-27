// import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { AnalyticsData, Position } from "./interfaces";

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
    .map((position) => position.amount * position.spotPrice)
    .reduce((sumVolume, positionVolume) => sumVolume + positionVolume, 0);
}

export default adapter;
