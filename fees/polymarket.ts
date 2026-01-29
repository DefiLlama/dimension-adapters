import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"
import ADDRESSES from '../helpers/coreAssets.json'

const FeeModule = '0xE3f18aCc55091e2c48d883fc8C8413319d4Ab7b0';
const NegRiskFeeModule = '0x78769D50Be1763ed1CA0D5E878D93f05aabff29e';

const Ctf = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const NegRiskCtf = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

const FeeRecipients = ['0xf21a25DD01ccA63A96adF862F4002d1A186DecB2','0xd4AA6F8E91cFEa29B66A48ebfF523AaFBdbbd40c'];

//https://docs.polymarket.com/polymarket-learn/trading/maker-rebates-program
const ProtocolFeeSwitchTime = 1768176000; //2026-01-12

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const [fees, liquidityRewards, holdingRewards] = await Promise.all([
    addTokensReceived({
    options,
    fromAdddesses: [FeeModule, NegRiskFeeModule, Ctf, NegRiskCtf],
    targets: FeeRecipients,
    token: ADDRESSES.polygon.USDC
    }),
    addTokensReceived({ 
      options, 
      token: ADDRESSES.polygon.USDC, 
      fromAddressFilter: '0xc288480574783BD7615170660d71753378159c47'
    }),
    addTokensReceived({ 
      options, 
      token: ADDRESSES.polygon.USDC, 
      fromAddressFilter: '0xC536633Ff12ee52e280b2aF2594031060C5aAf41'
    })
  ])
  const dailyFees = fees.clone(1, 'Taker Fees')
  const revenueRatio = options.startOfDay >= ProtocolFeeSwitchTime ? 0.8 : 0;
  const dailyRevenue = dailyFees.clone(revenueRatio);
  const dailySupplySideRevenue = dailyFees.clone(1 - revenueRatio, "Maker Rebates");
  dailySupplySideRevenue.addBalances(liquidityRewards, "Liquidity Rewards")
  dailySupplySideRevenue.addBalances(holdingRewards, "Holding Rewards")
  dailyRevenue.subtract(liquidityRewards, 'Taker Fees')
  dailyRevenue.subtract(holdingRewards, 'Taker Fees')

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay fees when they trade binary options on polymarket. Right now fees is charged only on 15 min up/down markets(only taker fees).',
    SupplySideRevenue: 'Maker rebates, liquidity and holding rewards',
    Revenue: 'Fees going to protocol address post maker rebate, liquidity and holding rewards distribution',
    ProtocolRevenue: 'All the revenue goes to protocol',
  },
  breakdownMethodology: {
    Fees: {
      'Taker Fees': 'Users pay fees when they trade binary options on polymarket. Right now fees is charged only on 15 min up/down markets(only taker fees).',
    },
    Revenue: {
      'Taker Fees': 'Users pay fees when they trade binary options on polymarket. Right now fees is charged only on 15 min up/down markets(only taker fees).',
    },
    ProtocolRevenue: {
      'Taker Fees': 'Taker fees minus rebates, liquidity and holding rewards',
    },
    SupplySideRevenue: {
      'Maker Rebates': 'Part of Fees charged on trades are distributed as maker rebates',
      'Liquidity Rewards': 'Liquidity incentives paid to users who place limit orders that help keep the market active and balanced',
      'Holding Rewards': 'Polymarket pays a 4.00% annualized Holding Reward on certain markets'
    }
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2022-09-26',
    }
  },
  allowNegativeValue: true // rewards are paid from treasury
}

export default adapter
