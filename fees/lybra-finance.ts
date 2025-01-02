import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = '0x97de57eC338AB5d51557DA3434828C5DbFaDA371'
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
      start: '2023-04-24',
    },
  }
};

export default adapter;
