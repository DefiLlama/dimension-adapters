import { ETHER_ADDRESS } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { comptrollerABI, CTokenABI } from "./_abi";
import * as sdk from "@defillama/sdk";

const getAllMarkets = async (
  unitroller: string,
  chain: CHAIN
): Promise<string[]> => {
  return (
    await sdk.api2.abi.call({
      target: unitroller,
      abi: comptrollerABI.getAllMarkets,
      chain: chain,
    })
  );
};
const getAllMarketsMulti = async (
  unitrollers: string[],
  chain: CHAIN
): Promise<string[]> => {

  return (
    await sdk.api2.abi.multiCall({
      calls: unitrollers.map((unitroller: string) => ({target:unitroller})),
      abi: comptrollerABI.getAllMarkets,
      chain: chain,
    })
  ).flat();
};

const getMarketDetails = async (markets: string[], chain: CHAIN) => {

  const underlyings = await sdk.api2.abi.multiCall({
    calls: markets.map((market: string) => ({
      target: market,
    })),
    abi: CTokenABI.underlying,
    chain: chain,
    permitFailure: true,
  });

  const reserveFactors = await sdk.api2.abi.multiCall({
    calls: markets.map((market: string) => ({
      target: market,
    })),
    abi: CTokenABI.reserveFactorMantissa,
    chain: chain,
  });

  return {
    underlyings: underlyings,
    reserveFactors: reserveFactors,
  };
};



export { getAllMarkets, getMarketDetails,getAllMarketsMulti };
