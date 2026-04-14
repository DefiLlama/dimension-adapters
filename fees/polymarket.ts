import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"
import ADDRESSES from '../helpers/coreAssets.json'

const FeeModule = '0xE3f18aCc55091e2c48d883fc8C8413319d4Ab7b0';
const NegRiskFeeModuleOld = '0x78769D50Be1763ed1CA0D5E878D93f05aabff29e';
const NegRiskFeeModuleNew = '0xB768891e3130F6dF18214Ac804d4DB76c2C37730';

const Ctf = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const NegRiskCtf = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
const WrappedCollateral = '0x3A3BD7bb9528E159577F7C2e685CC81A765002E2';

const FeeRecipients = [
  '0xf21a25DD01ccA63A96adF862F4002d1A186DecB2', //old
  '0xd4AA6F8E91cFEa29B66A48ebfF523AaFBdbbd40c', //main
  '0x525e4001f6DaD9406dFd84f3331D2B9b95c40b73', //negRisk 
];
const FeeDistributor = '0x3a9418b2651c8164DB5EBc56F12008137865e0f7';
const ProtocolFeeWallet = '0x2d507657cA4EBCc8F9a38F6764c07310B66DEA54';

//https://docs.polymarket.com/polymarket-learn/trading/maker-rebates-program
const ProtocolFeeSwitchTime = 1768176000; //2026-01-12

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  
  const [fees, liquidityRewards, holdingRewards] = await Promise.all([
    addTokensReceived({
      options,
      fromAdddesses: [FeeModule, NegRiskFeeModuleOld, NegRiskFeeModuleNew, Ctf, NegRiskCtf, WrappedCollateral],
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

  const [netOutflow, outFlowToProtocol] = await Promise.all([addTokensReceived({
    options,
    fromAddressFilter: FeeDistributor,
    token: ADDRESSES.polygon.USDC,
  }), addTokensReceived({
    options,
    fromAddressFilter: FeeDistributor,
    target: ProtocolFeeWallet,
    token: ADDRESSES.polygon.USDC,
  })])

  const makerRebatesFees = netOutflow.clone();
  makerRebatesFees.subtract(outFlowToProtocol);

  const revenueFromTakerFees = fees.clone();

  revenueFromTakerFees.subtract(makerRebatesFees)
  revenueFromTakerFees.subtract(liquidityRewards)
  revenueFromTakerFees.subtract(holdingRewards)
  
  dailyFees.add(fees, 'Taker Fees');
  dailyRevenue.add(revenueFromTakerFees, 'Taker Fees');
  dailySupplySideRevenue.add(makerRebatesFees, 'Maker Rebates')
  dailySupplySideRevenue.add(liquidityRewards, 'Liquidity Rewards')
  dailySupplySideRevenue.add(holdingRewards, 'Holding Rewards')

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Users pay fees when they trade binary options on polymarket',
    SupplySideRevenue: 'Maker rebates, liquidity and holding rewards',
    Revenue: 'Fees going to protocol address post maker rebate, liquidity and holding rewards distribution',
    ProtocolRevenue: 'All the revenue goes to protocol',
  },
  breakdownMethodology: {
    Fees: {
      'Taker Fees': 'Users pay fees when they trade binary options on polymarket.',
    },
    Revenue: {
      'Taker Fees': 'Users pay fees when they trade binary options on polymarket.',
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
  // Polymarket rewards LP from assets in their treasury
  // These rewards were subtracted from revenue and they can exceed fees from takers
  allowNegativeValue: true
}

export default adapter
