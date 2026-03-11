import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
const ADDRESSES = require('../helpers/coreAssets.json')

const PENDLE_FEE_DISTRIBUTOR_V2 = '0x8C237520a8E14D658170A633D96F8e80764433b9'
const PENDLE_STAKING: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x6E799758CEE75DAe3d84e09D40dc416eCf713652',
  [CHAIN.ARBITRUM]: '0x6DB96BBEB081d2a85E0954C252f2c1dC108b3f81',
  [CHAIN.BSC]: '0x782D9D67FeaA4d1CDF8222D9053c8CBA1c3B7982'
}
const BRIBE_DISTRIBUTOR: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0xa346Bd80943Aa3042E6709d80Ce9C3b8fbeAc4Ab',
  [CHAIN.ARBITRUM]: '0x8CE523cf1120d9B7703806c745B69663a2847504',
  [CHAIN.BSC]: '0x6E796bCF2B63b070F9cC0a7D3d857FeF628E9e5b'
}
const EXCLUDE_TOKENS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    '0xd1D7D99764f8a52Aff007b7831cc02748b2013b5',
    '0xC374f7eC85F8C7DE3207a10bB1978bA104bdA3B2',
    '0x6010676Bc2534652aD1Ef5Fa8073DcF9AD7EBFBe',
    '0x038C1b03daB3B891AfbCa4371ec807eDAa3e6eB6'
  ],
  [CHAIN.BSC]: [],
  [CHAIN.ARBITRUM]: [
    '0xa877a0E177b54A37066c1786F91a1DAb68F094AF'
  ]
}

const LP_FEE_DISTRIBUTION: { [chain: string]: { protocolRevenue: number; lpRevenue: number; totalProtocolRevenue: number, holderRevenue: number } } = {
  [CHAIN.ETHEREUM]: {
    protocolRevenue: 0.05,
    lpRevenue: 0.78,
    holderRevenue: 0.16, // mPENDLE Staking pool + vlPNP holders as mPendle
    totalProtocolRevenue: 0.05
  },
  [CHAIN.ARBITRUM]: {
    protocolRevenue: 0.05,
    lpRevenue: 0.78,
    holderRevenue: 0.16, // mPENDLE Staking pool + vlPNP holders as mPendle
    totalProtocolRevenue: 0.05
  },
  [CHAIN.BSC]: {
    protocolRevenue: 0.05,
    lpRevenue: 0.78,
    holderRevenue: 0.16, // mPENDLE Staking pool + vlPNP holders as mPendle
    totalProtocolRevenue: 0.05
  }
}

const EVENT_PAID_STREAM = 'event RewardPaidTo(address _market, address _to, address _rewardToken, uint256 _feeAmount)';
const EVENT_PAID_BRIBE = 'event RewardClaimed(address indexed token, address indexed account, uint256 amount, uint256 updateCount)';
const EVENT_PENDLE_FEE = 'event UpdateProtocolClaimable(address indexed user, uint256 sumTopUp)';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { createBalances, getLogs, chain } = options;
  const dailyFees = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyBribesRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  if (chain == 'ETHEREUM') {
    (await getLogs({
      target: PENDLE_FEE_DISTRIBUTOR_V2,
      eventAbi: EVENT_PENDLE_FEE,
    })).map((e: any) => {
      if (e.user === '0x6e799758cee75dae3d84e09d40dc416ecf713652') {
        dailyFees.add(ADDRESSES.null, e.sumTopUp);
        dailyProtocolRevenue.add(ADDRESSES.null, e.sumTopUp * LP_FEE_DISTRIBUTION[CHAIN.ETHEREUM].protocolRevenue)
        dailyHoldersRevenue.add(ADDRESSES.null, e.sumTopUp * LP_FEE_DISTRIBUTION[CHAIN.ETHEREUM].holderRevenue);
        dailySupplySideRevenue.add(ADDRESSES.null, e.sumTopUp * LP_FEE_DISTRIBUTION[CHAIN.ETHEREUM].lpRevenue);
      }
    })
  }

  (await getLogs({
    target: PENDLE_STAKING[chain],
    eventAbi: EVENT_PAID_STREAM,
  })).map((e: any) => {
    if (EXCLUDE_TOKENS[chain].includes(e._rewardToken)) {
      return
    }
    dailyFees.add(e._rewardToken, e._feeAmount)
    dailyHoldersRevenue.add(e._rewardToken, Number(e._feeAmount) * 0.2) // 20% is allocated to the PRT mechanism
  }),

    (await getLogs({
      target: BRIBE_DISTRIBUTOR[chain],
      eventAbi: EVENT_PAID_BRIBE,
    })).map((e: any) => {
      if (EXCLUDE_TOKENS[chain].includes(e.token)) {
        return
      }
      dailyFees.add(e.token, e.amount)
      dailyBribesRevenue.add(e.token, e.amount)
      dailyProtocolRevenue.add(e.token, Number(e.amount) * LP_FEE_DISTRIBUTION[chain].totalProtocolRevenue)
    })

  const dailyRevenue = dailyProtocolRevenue.clone();
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyBribesRevenue,
    dailySupplySideRevenue
  };
}

const info = {
  methodology: {
    Fees: 'Total boosted PENDLE rewards from liquidity farming on Pendle Finance',
    Revenue: 'Protocol revenue from boosted PENDLE rewards',
    ProtocolRevenue: '5% operational expenses + bribes share of protocol',
    HoldersRevenue: '5% vlPNP holders + 12% mPENDLE Staking pool + 20% PRT mechanism',
    SupplySideRevenue: '78% to liquidity providers',
    BribesRevenue: 'Bribes from voting incentives'
  }
}

const adapter: SimpleAdapter = {
  methodology: info.methodology,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.BSC],
  version: 2,
  pullHourly: true,
  adapter: {}
};

export default adapter;
