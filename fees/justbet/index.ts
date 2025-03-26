import { ethers } from "ethers";
import { ChainApi } from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import { vaultAdapterAbi, bankrollVaultAbi } from "./abis";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { FetchV2, Adapter, FetchResultFees, IJSON } from "../../adapters/types";

import {
  TOKEN_DETAILS,
  JUSTBET_BANKROLL_INDEXES,
  WINR_VAULT_ADAPTER_CONTRACT,
} from "./constants";

const getVaultAddresses = async (api: ChainApi) => {
  const vaultDetails = await api.call({
    abi: vaultAdapterAbi,
    target: WINR_VAULT_ADAPTER_CONTRACT,
    params: [JUSTBET_BANKROLL_INDEXES as any],
  });

  const [details, amounts] = [vaultDetails[0], vaultDetails[1]];

  const pools: { detail: any; amount: any }[] = [];
  details.forEach((detail, index) => {
    pools.push({
      detail: detail,
      amount: amounts[index],
    });
  });

  const vaults = pools.map((p) => ({
    vaultAddress: p.detail.vaultAddress,
    vaultTokenAddress: p.detail.bankrollTokenAddress,
  }));

  return vaults;
};

const getVaultProfitAllTime = async (
  api: ChainApi,
  vaultAddress: string,
  vaultTokenAddress: string,
  tokenPrices: IJSON<any>
) => {
  const returnAllTimeProfitLossIncludingActiveEpoch = bankrollVaultAbi.find(
    (abi) => abi.name === "returnAllTimeProfitLossIncludingActiveEpoch"
  );

  const profitDetails = await api.call({
    abi: returnAllTimeProfitLossIncludingActiveEpoch,
    target: vaultAddress,
  });

  const tokenDetails = TOKEN_DETAILS[vaultTokenAddress.toLowerCase()];
  const tokenPrice = tokenPrices[`coingecko:${tokenDetails.coingeckoId}`];

  const decimals = tokenDetails.decimals;
  const amount = Number(ethers.formatUnits(profitDetails[1], decimals));
  const amountUsd = amount * tokenPrice.price;

  return {
    revenue: amountUsd,
    fees: (amountUsd * 60) / 100,
    holdersRevenue: (amountUsd * 20) / 100,
  };
};

const getVaultProfitDaily = async (
  api: ChainApi,
  vaultAddress: string,
  vaultTokenAddress: string,
  tokenPrices: IJSON<any>,
  startOfDay: number
) => {
  const [currentEpochEndAbi, netProfitOrLossActiveEpoch] = [
    bankrollVaultAbi.find((abi) => abi.name === "currentEpochEnd"),
    bankrollVaultAbi.find(
      (abi) => abi.name === "returnNetProfitOrLossInActiveEpoch"
    ),
  ];

  const [epochEndTimestamp, netProfitOrLoss] = await Promise.all([
    api.call({
      abi: currentEpochEndAbi,
      target: vaultAddress,
    }),
    api.call({
      abi: netProfitOrLossActiveEpoch,
      target: vaultAddress,
    }),
  ]);

  const tokenDetails = TOKEN_DETAILS[vaultTokenAddress.toLowerCase()];
  const tokenPrice = tokenPrices[`coingecko:${tokenDetails.coingeckoId}`];

  const decimals = tokenDetails.decimals;
  const amount = Number(ethers.formatUnits(netProfitOrLoss[1], decimals));
  const amountUsd = amount * tokenPrice.price;

  const startOfDayTimestamp = getTimestampAtStartOfDayUTC(startOfDay);
  const totalTimeOfFinishingEpoch = epochEndTimestamp - startOfDayTimestamp;
  const totalDaysInEpoch = totalTimeOfFinishingEpoch / 86400;

  return {
    revenue: amountUsd / totalDaysInEpoch,
    fees: (amountUsd * 60) / 100 / totalDaysInEpoch,
    holdersRevenue: (amountUsd * 20) / 100 / totalDaysInEpoch,
  };
};

export default {
  adapter: {
    [CHAIN.WINR]: {
      fetch: (async ({ api, startOfDay }) => {
        const startOfDayTimestamp = getTimestampAtStartOfDayUTC(startOfDay);
        const tokenPrices = await getPrices(
          Object.values(TOKEN_DETAILS).map((t) => `coingecko:${t.coingeckoId}`),
          startOfDayTimestamp
        );

        const vaultAddresses = await getVaultAddresses(api);
        const allTimeProfits = await Promise.all(
          vaultAddresses.map((vaultAddress) =>
            getVaultProfitAllTime(
              api,
              vaultAddress.vaultAddress,
              vaultAddress.vaultTokenAddress,
              tokenPrices
            )
          )
        );

        const [totalFees, totalRevenue, totalHoldersRevenue] =
          allTimeProfits.reduce(
            (acc, curr) => {
              return [
                acc[0] + curr.fees,
                acc[1] + curr.revenue,
                acc[2] + curr.holdersRevenue,
              ];
            },
            [0, 0, 0]
          );

        const dailyProfits = await Promise.all(
          vaultAddresses.map((vaultAddress) =>
            getVaultProfitDaily(
              api,
              vaultAddress.vaultAddress,
              vaultAddress.vaultTokenAddress,
              tokenPrices,
              startOfDay
            )
          )
        );

        const [dailyFees, dailyRevenue, dailyHoldersRevenue] =
          dailyProfits.reduce(
            (acc, curr) => {
              return [
                acc[0] + curr.fees,
                acc[1] + curr.revenue,
                acc[2] + curr.holdersRevenue,
              ];
            },
            [0, 0, 0]
          );

        return {
          totalFees,
          totalRevenue,
          totalHoldersRevenue,
          dailyFees,
          dailyRevenue,
          dailyHoldersRevenue,
        } as FetchResultFees;
      }) as FetchV2,
      start: 1732060800,
    },
  },
  version: 2,
} as Adapter;
