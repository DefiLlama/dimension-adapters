import { BigNumberish } from "ethers";
import { CHAIN } from "../../helpers/chains";

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
  startBlock: number;
  endBlock: number;
  markets: string[];
  underlyings: string[];
  reserveFactors: string[];
  prices: IPrices;
  chain: CHAIN;
}

interface IAccrueInterestLog {
  market: string;
  cashPrior: BigNumberish;
  interestAccumulated: BigNumberish;
  borrowIndexNew: BigNumberish;
  totalBorrowsNew: BigNumberish;
}

export { IPrices, IContext, IAccrueInterestLog };
