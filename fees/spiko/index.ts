// https://docs.spiko.xyz/spiko-mmfs/fees

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IFunds = {
  [s: string]: string;
};

type IAddress = {
  [key: string]: IFunds;
};

const funds: IAddress = {
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

async function getFundsFees(
  funds: IFunds,
  { api, createBalances }: FetchOptions
): Promise<FetchResultV2> {
  const dailyFees = createBalances();
  const dailyRevenues = createBalances();
  const totalFees = createBalances();
  const totalRevenues = createBalances();
  const { EUTBL, USTBL } = funds;

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
    totalFees.add(fund, fees);
    dailyRevenues.add(fund, revenues / 365);
    totalRevenues.add(fund, revenues);
  });

  return { dailyFees, dailyRevenues, totalFees, totalRevenues };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: 1714514400,
      fetch: (options: FetchOptions) =>
        getFundsFees(funds[CHAIN.ETHEREUM], options),
    },
    [CHAIN.POLYGON]: {
      start: 1713564000,
      fetch: (options: FetchOptions) =>
        getFundsFees(funds[CHAIN.POLYGON], options),
    },
  },
};

export default adapter;
