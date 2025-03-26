import { CHAIN } from "../../helpers/chains";
import { vaultAdapterEpochStatsAbi } from "./abis";
import { FetchV2, Adapter, FetchResultAggregators } from "../../adapters/types";
import {
  JUSTBET_BANKROLL_INDEXES,
  WINR_VAULT_ADAPTER_CONTRACT,
} from "./constants";

export default {
  adapter: {
    [CHAIN.WINR]: {
      fetch: (async ({ api }) => {
        const volumeDetails = await Promise.all(
          JUSTBET_BANKROLL_INDEXES.map(async (index) => {
            const details = await api.call({
              abi: vaultAdapterEpochStatsAbi,
              params: [index],
              target: WINR_VAULT_ADAPTER_CONTRACT,
            });

            return {
              index,
              details,
            };
          })
        );

        const vaultDetails = volumeDetails.map((volumes) => {
          const { index, details } = volumes;

          return {
            index,
            epochVolume: Number(details[1]),
            allTimeVolume: Number(details[5]),
            secondsLeftInEpoch: Number(details[6]),
          };
        });

        const epochFinishSeconds = vaultDetails[0].secondsLeftInEpoch;
        const totalDaysInEpoch = 86400 / epochFinishSeconds;

        const totalVolume = vaultDetails.reduce(
          (acc, curr) => acc + curr.allTimeVolume,
          0
        );
        const dailyVolume =
          vaultDetails.reduce((acc, curr) => acc + curr.epochVolume, 0) /
          totalDaysInEpoch;

        return {
          totalVolume: totalVolume,
          dailyVolume: dailyVolume,
        } as FetchResultAggregators;
      }) as FetchV2,
      start: 1732060800,
    },
  },
  version: 2,
} as Adapter;
