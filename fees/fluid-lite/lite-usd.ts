import { FetchOptions } from "../../adapters/types";
import BigNumber from "bignumber.js";

export const FLITE_USD_VAULT = "0x273DA948ACa9261043fbdb2a857BC255ECC29012";
export const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

export async function fetchLiteUsd(options: FetchOptions) {
  const dailyRevenue = options.createBalances();
  const strategyHandlerAddress = await options.api.call({
    abi: "function getStrategyHandler() view returns (address)",
    target: FLITE_USD_VAULT,
  });

  const [currentRevenueValue, startRevenueValue] = await Promise.all([
    options.api.call({
      abi: "function getReserves() view returns (int256)",
      target: strategyHandlerAddress,
    }),
    options.fromApi.call({
      abi: "function getReserves() view returns (int256)",
      target: strategyHandlerAddress,
    }),
  ]);

  const reservesDelta = Number(currentRevenueValue) - Number(startRevenueValue);
  dailyRevenue.add(USDC_ADDRESS, reservesDelta, "Lite Vaults Fees");

  return { dailyFees: dailyRevenue, dailyRevenue };
}
