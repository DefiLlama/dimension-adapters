import { BigNumberish } from "ethers";

interface IPrices {
  [address: string]: {
    decimals: number;
    price: number;
    symbol: string;
    timestamp: number;
  };
}

interface IContext {
  markets: string[];
  underlyings: string[];
  reserveFactors: string[];
}

interface IAccrueInterestLog {
  market: string;
  cashPrior: BigNumberish;
  interestAccumulated: BigNumberish;
  borrowIndexNew: BigNumberish;
  totalBorrowsNew: BigNumberish;
}

export { IPrices, IContext, IAccrueInterestLog };
