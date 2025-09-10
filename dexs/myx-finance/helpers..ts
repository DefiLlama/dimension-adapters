import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ABIS = {
  PairAddedEvent: 'event PairAdded ( address  indexed indexToken,  address  indexed stableToken, address lpToken, uint256 index)',
  ExecuteOrderV2Event : 'event ExecuteOrderV2(address account, uint256 orderId, uint256 pairIndex, uint8 tradeType, int256 collateral, uint256 orderSize, uint256 orderPrice, uint256 executionSize, uint256 executionPrice, uint256 executedSize, int256 pnl, uint256 tradingFee, int256 fundingFee, uint8 paymentType, uint256 networkFeeAmount, uint256 flags)',
  DistributeTradingFeeV2Event : 'event DistributeTradingFeeV2(address account, uint256 pairIndex, uint256 orderId, uint256 sizeDelta, uint256 regularTradingFee, bool isMaker, int256 feeRate, int256 vipTradingFee, uint256 returnAmount, uint256 referralsAmount, uint256 referralUserAmount, address referralOwner, int256 lpAmount, int256 keeperAmount, int256 stakingAmount, int256 reservedAmount, int256 ecoFundAmount, int256 treasuryAmount)',
}

interface IPair {
  indexToken: string;
  stableToken: string;
  lpToken: string;
  index: number;
}

interface ExchangeConfig {
  factory: string;
  feeCollector: string;
  executor: string;
  fromBlock: number;
}

const ExchangeConfigs: Record<string, ExchangeConfig> = {
  [CHAIN.BSC]: {
    factory: '0x22cEc08111BBae24D0b80BDA2a6503EaB9BA704b',
    feeCollector: '0x459F76E2Ee136043FabEea0878007d06582235AA',
    executor: '0x9B9806e6134729881caBd7318e2dCa923894e2d6',
    fromBlock: 47537511,
  },
  [CHAIN.LINEA]: {
    factory: '0x03f61a185efEEEFdd3Ba032AFa8A0259337CEd64',
    feeCollector: '0x53Aa15BeBAA37998d7ADAF27E52B8a2b9A0C2977',
    executor: '0xA9065E6E37507A587ba7d08FC8682e427F96f912',
    fromBlock: 2390784,
  },
  [CHAIN.ARBITRUM]: {
    factory: '0x8932aA60A7b5EfEFA8Ec3ee899Fd238D029d10c6',
    feeCollector: '0xA9b2083a62d6A65Cdb958FdE3e91Dd8Df577fB5A',
    executor: '0xCaa1074AfD8109D4B5010cbD4682749dCEe6Fd7B',
    fromBlock: 175954437,
  },
}

export function getFetch(metric: 'volume' | 'fees'): FetchV2 {
  const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    // get all pairs
    const pairIdsMaps: {[key: number]: IPair} = {}
    const pairCreatedEvents = await options.getLogs({
      target: ExchangeConfigs[options.chain].factory,
      eventAbi: ABIS.PairAddedEvent,
      fromBlock: ExchangeConfigs[options.chain].fromBlock,
      onlyArgs: true,
    })
    for (const event of pairCreatedEvents) {
      pairIdsMaps[Number(event.index)] = {
        indexToken: event.indexToken,
        stableToken: event.stableToken,
        lpToken: event.lpToken,
        index: Number(event.index),
      }
    }

    if (metric === 'volume') {
      const dailyVolume = options.createBalances()
      const executeOrderV2Events = await options.getLogs({
        target: ExchangeConfigs[options.chain].executor,
        eventAbi: ABIS.ExecuteOrderV2Event,
      })
      for (const event of executeOrderV2Events) {
        const pairIndex = Number(event.pairIndex)
        if (pairIdsMaps[pairIndex]) {
          dailyVolume.add(pairIdsMaps[pairIndex].indexToken, event.orderSize)
        }
      }
  
      return { dailyVolume }
    } else {
      const dailyFees = options.createBalances()
      const dailyRevenue = options.createBalances()
      const dailyProtocolRevenue = options.createBalances()
      const dailySupplySideRevenue = options.createBalances()
      const distributeTradingFeeV2Events = await options.getLogs({
        target: ExchangeConfigs[options.chain].feeCollector,
        eventAbi: ABIS.DistributeTradingFeeV2Event,
      })
      for (const event of distributeTradingFeeV2Events) {
        const pairIndex = Number(event.pairIndex)
        if (pairIdsMaps[pairIndex]) {
          dailyFees.add(pairIdsMaps[pairIndex].stableToken, Number(event.lpAmount) + Number(event.keeperAmount) + Number(event.stakingAmount) + Number(event.ecoFundAmount) + Number(event.treasuryAmount))
          dailySupplySideRevenue.add(pairIdsMaps[pairIndex].stableToken, event.lpAmount)
          dailyRevenue.add(pairIdsMaps[pairIndex].stableToken, Number(event.keeperAmount) + Number(event.stakingAmount) + Number(event.ecoFundAmount) + Number(event.treasuryAmount))
          dailyProtocolRevenue.add(pairIdsMaps[pairIndex].stableToken, event.treasuryAmount)
        }
      }
  
      return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue }
    }
  }

  return fetch;
}
