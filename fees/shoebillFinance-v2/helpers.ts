import { ETHER_ADDRESS } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { comptrollerABI, CTokenABI } from "./_abi";
import * as sdk from "@defillama/sdk";

const getAllMarkets = async (
  unitroller: string,
  chain: CHAIN
): Promise<string[]> => {
  return (
    await sdk.api.abi.call({
      target: unitroller,
      abi: comptrollerABI.getAllMarkets,
      chain: chain,
    })
  ).output;
};
const getAllMarketsMulti = async (
  unitrollers: string[],
  chain: CHAIN
): Promise<string[]> => {

  return (
    await sdk.api.abi.multiCall({
      calls: unitrollers.map((unitroller: string) => ({target:unitroller})),
      abi: comptrollerABI.getAllMarkets,
      chain: chain,
    })
  ).output.map((x:any) => x.output).flat();
};

const getMarketDetails = async (markets: string[], chain: CHAIN) => {
  
  const underlyings = await sdk.api.abi.multiCall({
    calls: markets.map((market: string) => ({
      target: market,
    })),
    abi: CTokenABI.underlying,
    chain: chain,
    permitFailure: true,
  });

  const reserveFactors = await sdk.api.abi.multiCall({
    calls: markets.map((market: string) => ({
      target: market,
    })),
    abi: CTokenABI.reserveFactorMantissa,
    chain: chain,
  });

  return {
    underlyings: underlyings.output.map((x: any) => x.output ?? ETHER_ADDRESS),
    reserveFactors: reserveFactors.output.map((x: any) => x.output),
  };
};



export { getAllMarkets, getMarketDetails,getAllMarketsMulti };
