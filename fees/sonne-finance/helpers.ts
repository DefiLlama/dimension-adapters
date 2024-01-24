import { CHAIN } from "../../helpers/chains";
import { comptrollerABI, CTokenABI, veloGaugeAbi } from "./_abi";
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

const getMarketDetails = async (markets: string[], chain: CHAIN) => {
  const underlyings = await sdk.api2.abi.multiCall({
    calls: markets.map((market: string) => ({
      target: market,
    })),
    abi: CTokenABI.underlying,
    chain: chain,
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

const getVeloGaugeDetails = async (
  gauge: string,
  token: string,
  account: string,
  chain: CHAIN,
) => {
  const lastEarn = await sdk.api2.abi.call({
    target: gauge,
    abi: veloGaugeAbi.lastEarn,
    chain: chain,
    params: [token, account],
  });
  const earned = await sdk.api2.abi.call({
    target: gauge,
    abi: veloGaugeAbi.earned,
    chain: chain,
    params: [token, account],
  });

  return {
    lastEarn: lastEarn,
    earned: earned,
  };
};

export { getAllMarkets, getMarketDetails, getVeloGaugeDetails };
