import { comptrollerABI, CTokenABI } from "./_abi";
import * as sdk from "@defillama/sdk";

const getAllMarkets = async (unitroller: string, api: sdk.ChainApi,): Promise<string[]> => {
  return (api.call({ target: unitroller, abi: comptrollerABI.getAllMarkets, }));
}

const getAllMarketsMulti = async (unitrollers: string[], api: sdk.ChainApi,): Promise<string[]> => {
  return (await api.multiCall({ calls: unitrollers, abi: comptrollerABI.getAllMarkets, })).flat();
}

const getMarketDetails = async (markets: string[], api: sdk.ChainApi,) => {
  const underlyings = await api.multiCall({ calls: markets, abi: CTokenABI.underlying, permitFailure: true, });
  const reserveFactors = await api.multiCall({ calls: markets, abi: CTokenABI.reserveFactorMantissa, });
  return { underlyings, reserveFactors, };
}

export { getAllMarkets, getMarketDetails, getAllMarketsMulti };
