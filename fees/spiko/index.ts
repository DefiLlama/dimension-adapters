// https://docs.spiko.xyz/spiko-mmfs/fees

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const funds: Record<string, Record<string, string>> = {
  [CHAIN.ETHEREUM]: {
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
  },
  [CHAIN.POLYGON]: {
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
  },
};

const calcFees = (totalSupply: number, isEUTBL: boolean) => {
  const baseFeeRate = 0.1;
  const performanceFeeRate = 0.3;
  const revenueRate = 0.15;
  const minAumForFees = 100 * 1e6;

  const managementFee =
    isEUTBL && totalSupply <= minAumForFees ? 0 : baseFeeRate;
  const totalFeesBalance =
    (totalSupply * (managementFee + performanceFeeRate)) / 100;
  const totalRevenuesBalance =
    (totalSupply *
      (isEUTBL && totalSupply <= minAumForFees ? 0 : revenueRate)) /
    100;

  return {
    fees: totalFeesBalance,
    revenues: totalRevenuesBalance,
  };
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { api, createBalances, chain } = options;
  const dailyFees = createBalances();
  const dailyRevenues = createBalances();
  const { EUTBL, USTBL } = funds[chain];

  const totalSupplies = await api.multiCall({
    calls: [EUTBL, USTBL],
    abi: "erc20:totalSupply",
  });

  const [eutlbSupply, ustblSupply] = [EUTBL, USTBL].map((fund, index) => {
    const totalSupply: number = totalSupplies[index];
    return { fund, totalSupply };
  });

  const ustblFees = calcFees(ustblSupply.totalSupply, false);
  const eutblFees = calcFees(eutlbSupply.totalSupply, true);

  const feesDatas = [
    { ...ustblFees, fund: ustblSupply.fund },
    { ...eutblFees, fund: eutlbSupply.fund },
  ];

  feesDatas.forEach(({ fund, fees, revenues }) => {
    dailyFees.add(fund, fees / 365);
    dailyRevenues.add(fund, revenues / 365);
  });

  return { dailyFees, dailyRevenue: dailyRevenues };
};

const methodology = {
  Fees: 'Total yields are generated from investment assets.',
  Revenue: '15% yields are collected by Spiko protocol.',
}

const adapter: Adapter = {
  methodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-05-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2024-04-20',
    },
  },
};

export default adapter;
