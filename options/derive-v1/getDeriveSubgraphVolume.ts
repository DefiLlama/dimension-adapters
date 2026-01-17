import { Chain } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { wrapGraphError } from "../../helpers/getUniSubgraph";

const UNIT = 1e18

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
        ).catch((e) => {
          console.error(`Failed to get total volume on ${chain}: ${wrapGraphError(e).message}`);
          // Return empty response on error
          return { markets: [] };
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
                notional: acc.notional,
                premium: acc.premium,
                totalNotional: acc.totalNotional + Number(obj.volumeAndFeesHistory[0].totalNotionalVolume) / UNIT,
                totalPremium: acc.totalPremium + Number(obj.volumeAndFeesHistory[0].totalPremiumVolume) / UNIT,
              };
            }
            return {
              notional: acc.notional + Number(obj.volumeAndFeesHistory[0].notionalVolume) / UNIT,
              premium: acc.premium + Number(obj.volumeAndFeesHistory[0].premiumVolume) / UNIT,
              totalNotional: acc.totalNotional + Number(obj.volumeAndFeesHistory[0].totalNotionalVolume) / UNIT,
              totalPremium: acc.totalPremium + Number(obj.volumeAndFeesHistory[0].totalPremiumVolume) / UNIT,
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
        dailyPremiumVolume: totalVolume.premium,
        dailyNotionalVolume: totalVolume.notional,
      };
    };
  };
}

export { getChainVolume };
