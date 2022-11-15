import { Chain } from "@defillama/sdk/build/general";
import { BigNumber } from "ethers";
import { request, gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const UNIT = BigNumber.from("1000000000000000000");

interface IGetChainVolumeParams {
  graphUrls: {
    [chains: string]: string;
  };
  timestamp?: number;
}

interface IDayVolumeResponse {
  marketVolumeAndFeesSnapshots: Array<{
    premiumVolume: string
    notionalVolume: string
    totalPremiumVolume: string
    totalNotionalVolume: string
  }>
}

function getChainVolume({ graphUrls }: IGetChainVolumeParams) {
  const dailyVolumeQuery = gql`
  query ($timestamp: Int) {
    marketVolumeAndFeesSnapshots (where: {period:86400, timestamp: $timestamp}) {
      premiumVolume
      notionalVolume
      totalPremiumVolume
      totalNotionalVolume
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number) => {
      const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
      const previousDayVolume: IDayVolumeResponse = await request(
        graphUrls[chain],
        dailyVolumeQuery,
        { timestamp: cleanTimestamp }
      ).catch((e) =>
        console.error(`Failed to get total volume on ${chain}: ${e.message}`)
      );

      const prevDayVolumeSum = previousDayVolume.marketVolumeAndFeesSnapshots.reduce(
        (acc, obj) => {
          let vals = {
            notional:
              acc.notional +
              BigNumber.from(obj.notionalVolume)
                .div(UNIT)
                .toNumber(),
            premium:
              acc.premium +
              BigNumber.from(obj.premiumVolume)
                .div(UNIT)
                .toNumber(),
            totalNotional:
              acc.notional +
              BigNumber.from(obj.totalNotionalVolume)
                .div(UNIT)
                .toNumber(),
            totalPremium:
              acc.premium +
              BigNumber.from(obj.totalPremiumVolume)
                .div(UNIT)
                .toNumber(),
          };

          return vals;
        },
        { notional: 0, premium: 0, totalNotional: 0, totalPremium: 0 }
      );

      return {
        timestamp,
        totalPremiumVolume: prevDayVolumeSum.totalPremium,
        totalNotionalVolume: prevDayVolumeSum.totalNotional,
        dailyPremiumVolume: prevDayVolumeSum.premium,
        dailyNotionalVolume: prevDayVolumeSum.notional
      };
    };
  };
}

export { getChainVolume };
