import { comptrollerABI, CTokenABI, veloGaugeAbi } from "./_abi";

const getAllMarkets = async (unitroller: string, api: any): Promise<string[]> => {
  return api.call({ target: unitroller, abi: comptrollerABI.getAllMarkets, })
};

const getMarketDetails = async (markets: string[], api: any) => {
  const underlyings = await api.multiCall({ calls: markets, abi: CTokenABI.underlying, });
  const reserveFactors = await api.multiCall({ calls: markets, abi: CTokenABI.reserveFactorMantissa, });

  return {
    underlyings: underlyings,
    reserveFactors: reserveFactors,
  };
};

const getVeloGaugeDetails = async (
  gauge: string,
  token: string,
  account: string,
  api: any
) => {
  const lastEarn = await api.call({
    target: gauge,
    abi: veloGaugeAbi.lastEarn,
    params: [token, account],
  });
  const earned = await api.call({
    target: gauge,
    abi: veloGaugeAbi.earned,
    params: [token, account],
  });

  return {
    lastEarn: lastEarn,
    earned: earned,
  };
};

export { getAllMarkets, getMarketDetails, getVeloGaugeDetails };
