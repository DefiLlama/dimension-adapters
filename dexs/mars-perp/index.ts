import axios from "axios";
import BigNumber from "bignumber.js";
import { FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

function convertToUsd(value: string | number): number {
  // all values are in uusd
  return new BigNumber(value).shiftedBy(-6).toNumber();
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { fromTimestamp } = options;
  const perpsInfoApi =
    "https://backend.prod.mars-dev.net/v2/perps_overview?chain=neutron&days=30&response_type=global&granularity=day";
  const perpsVolumeData = await axios(perpsInfoApi);
  const globalOverview = perpsVolumeData.data.global_overview;

  let last24HourVolume = 0;
  let fetchTimestamp = fromTimestamp;
  let last24HourFees = 0;
  let last24HourRevenue = 0;
  let last24HoursShortOpenInterest = 0;
  let last24HoursLongOpenInterest = 0;
  let last24HoursTotalOpenInterest = 0;

  // Check for the last timestamp that is less than or equal to the fetched timestamp
  if (globalOverview) {
    let foundLatestData = false;

    globalOverview.trading_volume.forEach((volumeData, index) => {
      const dataTimestamp = Math.round(
        new Date(volumeData.date).getTime() / 1000
      );
      if (dataTimestamp <= fromTimestamp && !foundLatestData) {
        const nextIndex = index + 1;
        last24HourVolume = convertToUsd(volumeData.value);
        fetchTimestamp = dataTimestamp;
        last24HourFees = convertToUsd(
          globalOverview.fees.realized_trading_fee[index].value -
          Number(
            globalOverview.fees.realized_trading_fee[nextIndex].value ?? 0
          )
        );
        last24HourRevenue = last24HourFees * 0.25;
        last24HoursShortOpenInterest = convertToUsd(
          globalOverview.open_interest.short[index].value
        );
        last24HoursLongOpenInterest = convertToUsd(
          globalOverview.open_interest.long[index].value
        );
        last24HoursTotalOpenInterest = convertToUsd(
          globalOverview.open_interest.total[index].value
        );
        foundLatestData = true;
      }
    });
  }

  return {
    dailyVolume: last24HourVolume,
    dailyProtocolRevenue: last24HourRevenue,
    dailyRevenue: last24HourRevenue,
    dailyFees: last24HourFees,
    shortOpenInterestAtEnd: last24HoursShortOpenInterest,
    longOpenInterestAtEnd: last24HoursLongOpenInterest,
    openInterestAtEnd: last24HoursTotalOpenInterest,
  };
};

const adapter = {
  version: 2,
  adapter: {
    [CHAIN.NEUTRON]: {
      fetch,
      runAtCurrTime: true,
      start: "2024-12-13",
    },
  },
  methodology: {
    Volume: "Volume is calculated by summing the token volume of all perpetual trades settled on the protocol that day.",
    Fees: "Fees are the sum of the trading fees of all perpetual trades settled on the protocol that day.",
    ProtocolRevenue: "The daily revenue going to the protocol is 25% of the daily fees.",
  },
};
export default adapter;
