import { Chain } from "@defillama/sdk/build/general";
import { BigNumber } from "ethers";
import { request, gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const UNIT = BigNumber.from("1000000000000000000");

interface IGetChainVolumeParams {
  graphUrls: {
    [chains: string]: string[];
  };
  timestamp?: number;
}

interface IDayVolumeResponse {
  markets: Array<{
    volumeAndFeesHistory: Array<{
      timestamp: number;
      premiumVolume: string;
      notionalVolume: string;
      totalPremiumVolume: string;
      totalNotionalVolume: string;
    }>;
  }>;
}

function getChainVolume({ graphUrls }: IGetChainVolumeParams) {
  const dailyVolumeQuery = gql`
    query ($timestamp: Int) {
      markets {
        volumeAndFeesHistory(
          first: 1
          orderBy: timestamp
          orderDirection: desc
          where: { period: 86400, timestamp_lte: $timestamp }
        ) {
          timestamp
          premiumVolume
          notionalVolume
          totalPremiumVolume
          totalNotionalVolume
        }
      }
    }
  `;

  return (chain: Chain) => {
    return async (timestamp: number) => {
      const cleanTimestamp = getUniqStartOfTodayTimestamp(
        new Date(timestamp * 1000)
      );

      const volumePromises = graphUrls[chain].map(async (url) => {
        const previousDayVolume: IDayVolumeResponse = await request(
          url,
          dailyVolumeQuery,
          { timestamp: cleanTimestamp }
        ).catch((e) =>
          console.error(`Failed to get total volume on ${chain}: ${e.message}`)
        );
        console.log(chain);
        previousDayVolume.markets.forEach((element) => {
          console.log(element);
        });

        return previousDayVolume.markets.reduce(
          (acc, obj) => {
            if (!obj.volumeAndFeesHistory[0]) {
              return {
                notional: acc.notional,
                premium: acc.premium,
                totalNotional: acc.totalNotional,
                totalPremium: acc.totalPremium,
              };
            } else if (
              obj.volumeAndFeesHistory[0].timestamp != cleanTimestamp
            ) {
              return {
                notional:
                  acc.notional,
                premium:
                  acc.premium,
                totalNotional:
                  acc.totalNotional +
                  BigNumber.from(
                    obj.volumeAndFeesHistory[0].totalNotionalVolume
                  )
                    .div(UNIT)
                    .toNumber(),
                totalPremium:
                  acc.totalPremium +
                  BigNumber.from(obj.volumeAndFeesHistory[0].totalPremiumVolume)
                    .div(UNIT)
                    .toNumber(),
              };
            }
            return {
              notional:
                acc.notional +
                BigNumber.from(obj.volumeAndFeesHistory[0].notionalVolume)
                  .div(UNIT)
                  .toNumber(),
              premium:
                acc.premium +
                BigNumber.from(obj.volumeAndFeesHistory[0].premiumVolume)
                  .div(UNIT)
                  .toNumber(),
              totalNotional:
                acc.totalNotional +
                BigNumber.from(obj.volumeAndFeesHistory[0].totalNotionalVolume)
                  .div(UNIT)
                  .toNumber(),
              totalPremium:
                acc.totalPremium +
                BigNumber.from(obj.volumeAndFeesHistory[0].totalPremiumVolume)
                  .div(UNIT)
                  .toNumber(),
            };
          },
          { notional: 0, premium: 0, totalNotional: 0, totalPremium: 0 }
        );
      });

      const volumes = await Promise.all(volumePromises);

      // Sum the volumes
      const totalVolume = volumes.reduce(
        (acc, volume) => {
          return {
            notional: acc.notional + volume.notional,
            premium: acc.premium + volume.premium,
            totalNotional: acc.totalNotional + volume.totalNotional,
            totalPremium: acc.totalPremium + volume.totalPremium,
          };
        },
        { notional: 0, premium: 0, totalNotional: 0, totalPremium: 0 }
      );

      return {
        timestamp,
        totalPremiumVolume: totalVolume.totalPremium,
        totalNotionalVolume: totalVolume.totalNotional,
        dailyPremiumVolume: totalVolume.premium,
        dailyNotionalVolume: totalVolume.notional,
      };
    };
  };
}

export { getChainVolume };
