import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

async function fetch(_t: any, _tt: any, options: FetchOptions) {
  const contractsResponse = await fetchURL('https://data.api.drift.trade/stats/markets');
  const longOpenInterestAtEnd = contractsResponse.markets
    .filter((contract: any) => contract.marketType === 'perp' && contract.status == 'active')
    .reduce((acc: number, contract: any) => {
      const openInterest = Math.abs(parseFloat(contract.openInterest.long));
      const lastPrice = parseFloat(contract.price);
      return acc + (openInterest * lastPrice);
    }, 0);
  const shortOpenInterestAtEnd = contractsResponse.markets
    .filter((contract: any) => contract.marketType === 'perp' && contract.status == 'active')
    .reduce((acc: number, contract: any) => {
      const openInterest = Math.abs(parseFloat(contract.openInterest.short));
      const lastPrice = parseFloat(contract.price);
      return acc + (openInterest * lastPrice);
    }, 0);
  const openInterestAtEnd = longOpenInterestAtEnd + shortOpenInterestAtEnd;

  return {
    openInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
}


const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-07-25',
  runAtCurrTime: true,
};

export default adapter;
