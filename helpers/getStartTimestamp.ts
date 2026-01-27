import { request, gql } from "graphql-request";
import { handle200Errors } from "./getUniSubgraph/utils";

import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD } from "./getUniSubgraphVolume";

export const DEFAULT_DATE_FIELD = "date"

interface IGetStartTimestamp {
  endpoints: {
    [chain: string]: string;
  }
  chain: string
  dailyDataField?: string
  volumeField?: string
  dateField?: string
  first?: number
}

const startCache: {
  [key: string]: any
} = {};

const getStartTimestamp =
  ({
    endpoints,
    chain,
    dailyDataField = `${DEFAULT_DAILY_VOLUME_FACTORY}s`,
    volumeField = DEFAULT_DAILY_VOLUME_FIELD,
    dateField = DEFAULT_DATE_FIELD,
    first = 1000,
  }: IGetStartTimestamp) =>
    async () => {
      let key = `${chain}-${endpoints[chain]}-${dailyDataField}-${volumeField}-${dateField}`;
      if (startCache[key]) return startCache[key];

      const query = gql`
        {
            ${dailyDataField}(first: ${first}) {
                ${dateField}
                ${volumeField}
            }
        }
    `;

      const result = await request(endpoints[chain], query).catch(handle200Errors).catch(console.error);

      const days = result?.[dailyDataField];

      const firstValidDay = days?.find((data: any) => data[volumeField] !== "0");

      if (firstValidDay)
        startCache[key] = firstValidDay[dateField];

      return firstValidDay?.[dateField];
    };

export {
  getStartTimestamp,
};
