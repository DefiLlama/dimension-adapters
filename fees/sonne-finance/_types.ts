import { BigNumber } from "ethers";

interface IPrices {
  [address: string]: {
    decimals: number;
    price: number;
    symbol: string;
    timestamp: number;
  };
}

interface IContext {
  currentTimestamp: number;
  startTimestamp: number;
  endTimestamp: number;
  currentBlock: number;
  startBlock: number;
  endBlock: number;
  markets: string[];
  underlyings: string[];
  reserveFactors: string[];
  prices: IPrices;
}

interface IAccrueInterestLog {
  market: string;
  cashPrior: BigNumber;
  interestAccumulated: BigNumber;
  borrowIndexNew: BigNumber;
  totalBorrowsNew: BigNumber;
}

export { IPrices, IContext, IAccrueInterestLog };
