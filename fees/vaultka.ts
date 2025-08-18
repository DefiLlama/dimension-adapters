import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const usdc = ADDRESSES.arbitrum.USDC_CIRCLE;
const usdce = ADDRESSES.arbitrum.USDC;

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, tokens: [usdc, usdce], targets: [
      '0x1b5e59759577fa0079e2a35bc89143bc0603d546',
      '0xD5aC6419635Aa6352EbaDe0Ab42d25FbFa570D21',
    ]
  })

  return { dailyFees, }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: '2023-08-09',
    },
  },
  methodology: {
    UserFees: "15% of management fee and 0.08%-0.2% withdrawal fee across all the strategies, for details, check our official documentation",
    Fees: "15% of management fee and 0.08%-0.2% withdrawal fee across all the strategies, for details, check our official documentation",
  },
};
export default adapter;
