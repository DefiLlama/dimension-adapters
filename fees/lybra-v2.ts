import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";



const address = '0xa980d4c0C2E48d305b582AA439a3575e3de06f0E'
const event_fees_distibute = 'event FeeDistribution(address indexed feeAddress,uint256 feeAmount,uint256 timestamp)';

const fetch = async ({ createBalances, getLogs, }: FetchOptions) => {
  const logs = await getLogs({ target: address, eventAbi: event_fees_distibute })
  const dailyFees = createBalances()
  logs.forEach((tx: any) => dailyFees.addUSDValue(Number(tx.feeAmount) / 10 ** 18))
  const dailyRevenue = dailyFees;
  const dailyHoldersRevenue = dailyFees;
  return { dailyRevenue, dailyHoldersRevenue, dailyFees, };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2023-08-31',
    },
  }
};

export default adapter;
