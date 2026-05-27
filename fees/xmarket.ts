import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"
import ADDRESSES from '../helpers/coreAssets.json'

// XMarket — BNB Mainnet
const XMarketExchange = '0xF05c3f1605Ce40e8030718755FA1f84eA01DF1A9';
const FeeManagement   = '0xEdcC0B26dEC24eCb718d92eAA8c56Fb5e13d34b8';

// Fee recipients from FeeManagement storage:
// platform    : 0xABDE73E95979aDc783499CF8D6067fBE1484494d  
// referral    : 0x533C8A5EfE191df50e04EE64A75f68ab76474281  
// company     : 0x762AB8d04Ff6A015E39Fbf7b981246b24bf0F0F4  
// treasury    : 0xe7F2281B451091F747507A24Dc3372810EA078C0
// adminWallet(private): 0x4A41Fde2Aa9B5d7904ea9CE8D0Bff4621075B35E  
// presaleRevenueAddr  : 0xbb11f933c548201e2ed3d69950d7bd55427d5c6d  
const FeeRecipients = [
  '0xABDE73E95979aDc783499CF8D6067fBE1484494d', // platform
  '0x762AB8d04Ff6A015E39Fbf7b981246b24bf0F0F4', // company
  '0x533C8A5EfE191df50e04EE64A75f68ab76474281', // referral
  '0xe7F2281B451091F747507A24Dc3372810EA078C0', // treasury
  '0x4A41Fde2Aa9B5d7904ea9CE8D0Bff4621075B35E', // adminWallet (distributeFee remainder)
  '0xbb11f933c548201e2ed3d69950d7bd55427d5c6d', // presaleRevenueAddress
];

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Fees: USDT flowing from FeeManagement/XMarketExchange to all configured fee recipients
  const fees = await addTokensReceived({
    options,
    fromAdddesses: [FeeManagement, XMarketExchange],
    targets: FeeRecipients,
    token: ADDRESSES.bsc.USDT,
  });

  // Referral rewards go to supply side
  const referralRewards = await addTokensReceived({
    options,
    token: ADDRESSES.bsc.USDT,
    targets: ['0x533C8A5EfE191df50e04EE64A75f68ab76474281'],
    fromAdddesses: [FeeManagement],
  });

  dailyFees.add(fees);
  dailyRevenue.add(fees);
  dailyRevenue.subtract(referralRewards);
  dailySupplySideRevenue.add(referralRewards);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
    Fees: 'Protocol fees collected from trading on XMarket prediction markets (BNB chain)',
    Revenue: 'Fees to configured recipients (platform, company, treasury, adminWallet, presale), net of referral rewards',
    ProtocolRevenue: 'All revenue goes to protocol',
    SupplySideRevenue: 'Referral rewards distributed to referrers',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  chains: [CHAIN.BSC],
  fetch,
  start: '2026-02-09',
}

export default adapter
