// import fetchURL from "../../utils/fetchURL"
// import { SimpleAdapter } from "../../adapters/types";
// import { CHAIN } from "../../helpers/chains";
// import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

// const START_TIME = 1659312000;
// const historicalVolumeEndpoint = (until: number) => `https://api-insights.carbon.network/pool/volume?from=${START_TIME}&interval=day&until=${until}`

// interface IVolumeall {
//   volumeValue: string;
//   totalVolumeValue: string;
//   date: string;
// }

// const fetch = async (timestamp: number) => {
//   const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
//   const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(dayTimestamp)))?.data.result.entries;

//   const volume = historicalVolume
//     .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === dayTimestamp)

//   return {
//     totalVolume: `${volume?.totalVolumeValue}`,
//     dailyVolume: volume ? `${volume.volumeValue}` : undefined,
//     timestamp: dayTimestamp,
//   };
// };

// const adapter: SimpleAdapter = {
//   adapter: {
//     [CHAIN.CARBON]: {
//       fetch,
//       start: async () => START_TIME,
//     },
//   },
// };

// export default adapter;

const getUniqStartOfTodayTimestamp = (date = new Date()) => {
  var date_utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
  var startOfDay = new Date(date_utc);
  var timestamp = startOfDay.getTime() / 1000;
  return Math.floor(timestamp / 86400) * 86400;
};
const date = new Date(Date.UTC(2023, 4, 15, 3, 0, 0));

// Get the Unix timestamp (in seconds) for the specified date
const timestamp = Math.floor(date.getTime() / 1000);

const exactDateTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
console.log(exactDateTimestamp)