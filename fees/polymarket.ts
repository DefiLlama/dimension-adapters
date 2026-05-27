import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"
import ADDRESSES from '../helpers/coreAssets.json'

const POLYMARKET_ADDRESSES = {
  v1: {
    FeeModule: '0xE3f18aCc55091e2c48d883fc8C8413319d4Ab7b0',
    NegRiskFeeModuleOld: '0x78769D50Be1763ed1CA0D5E878D93f05aabff29e',
    NegRiskFeeModuleNew: '0xB768891e3130F6dF18214Ac804d4DB76c2C37730',
    Ctf: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
    NegRiskCtf: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
    WrappedCollateral: '0x3A3BD7bb9528E159577F7C2e685CC81A765002E2',
    FeeRecipients: [
      '0xf21a25DD01ccA63A96adF862F4002d1A186DecB2', //old
      '0xd4AA6F8E91cFEa29B66A48ebfF523AaFBdbbd40c', //main
      '0x525e4001f6DaD9406dFd84f3331D2B9b95c40b73', //negRisk 
    ]
  },
  v2: {
    Ctf: '0xE111180000d2663C0091e4f400237545B87B996B',
    NegRiskCtf: '0xe2222d279d744050d28e00520010520000310F59',
    FeeRecipients: [
      '0x115F48DC2A731aA16251c6d6e1BEfC42f92Accc9'
    ]
  },
  common: {
    FeeDistributor: '0x3a9418b2651c8164DB5EBc56F12008137865e0f7',
    ProtocolFeeWallet: '0x2d507657cA4EBCc8F9a38F6764c07310B66DEA54',
    LiquidityRewardsDistributor: '0xc288480574783BD7615170660d71753378159c47',
    HoldingRewardsDistributor: '0xC536633Ff12ee52e280b2aF2594031060C5aAf41',
  }
}

//https://docs.polymarket.com/polymarket-learn/trading/maker-rebates-program
const ProtocolFeeSwitchTime = 1768176000; //2026-01-12

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [fees, liquidityRewards, holdingRewards, liquidityDistributorUsdcToPusdWrapping, holdingDistributorUsdcToPusdWrapping] = await Promise.all([
    addTokensReceived({
      options,
      fromAdddesses: [POLYMARKET_ADDRESSES.v1.FeeModule, POLYMARKET_ADDRESSES.v1.NegRiskFeeModuleOld, POLYMARKET_ADDRESSES.v1.NegRiskFeeModuleNew, POLYMARKET_ADDRESSES.v1.Ctf, POLYMARKET_ADDRESSES.v1.NegRiskCtf, POLYMARKET_ADDRESSES.v1.WrappedCollateral,
      POLYMARKET_ADDRESSES.v2.Ctf, POLYMARKET_ADDRESSES.v2.NegRiskCtf
      ],
      targets: [...POLYMARKET_ADDRESSES.v1.FeeRecipients, ...POLYMARKET_ADDRESSES.v2.FeeRecipients],
      tokens: [ADDRESSES.polygon.USDC, ADDRESSES.polygon.PUSD]
    }),
    addTokensReceived({
      options,
      tokens: [ADDRESSES.polygon.USDC, ADDRESSES.polygon.PUSD],
      fromAddressFilter: POLYMARKET_ADDRESSES.common.LiquidityRewardsDistributor
    }),
    addTokensReceived({
      options,
      tokens: [ADDRESSES.polygon.USDC, ADDRESSES.polygon.PUSD],
      fromAddressFilter: POLYMARKET_ADDRESSES.common.HoldingRewardsDistributor
    }),
    addTokensReceived({
      options,
      token: ADDRESSES.polygon.USDC,
      target: ADDRESSES.polygon.PUSD,
      fromAddressFilter: POLYMARKET_ADDRESSES.common.LiquidityRewardsDistributor
    }),
    addTokensReceived({
      options,
      token: ADDRESSES.polygon.USDC,
      target: ADDRESSES.polygon.PUSD,
      fromAddressFilter: POLYMARKET_ADDRESSES.common.HoldingRewardsDistributor
    })
  ])

  const [netOutflow, outFlowToProtocolOrWrapping] = await Promise.all([addTokensReceived({
    options,
    fromAddressFilter: POLYMARKET_ADDRESSES.common.FeeDistributor,
    tokens: [ADDRESSES.polygon.USDC, ADDRESSES.polygon.PUSD],
  }), addTokensReceived({
    options,
    fromAddressFilter: POLYMARKET_ADDRESSES.common.FeeDistributor,
    targets: [POLYMARKET_ADDRESSES.common.ProtocolFeeWallet, ADDRESSES.polygon.PUSD],
    tokens: [ADDRESSES.polygon.USDC, ADDRESSES.polygon.PUSD],
  })])

  const makerRebatesFees = netOutflow.clone();
  makerRebatesFees.subtract(outFlowToProtocolOrWrapping);

  const netLiquidityRewards = liquidityRewards.clone();
  netLiquidityRewards.subtract(liquidityDistributorUsdcToPusdWrapping);
  const netHoldingRewards = holdingRewards.clone();
  netHoldingRewards.subtract(holdingDistributorUsdcToPusdWrapping);

  const revenueFromTakerFees = fees.clone();

  revenueFromTakerFees.subtract(makerRebatesFees)
  revenueFromTakerFees.subtract(netLiquidityRewards)
  revenueFromTakerFees.subtract(netHoldingRewards)

  dailyFees.add(fees, 'Taker Fees');
  dailyRevenue.add(revenueFromTakerFees, 'Taker Fees');
  dailySupplySideRevenue.add(makerRebatesFees, 'Maker Rebates')
  dailySupplySideRevenue.add(netLiquidityRewards, 'Liquidity Rewards')
  dailySupplySideRevenue.add(netHoldingRewards, 'Holding Rewards')

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
