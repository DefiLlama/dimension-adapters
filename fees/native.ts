import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from '../helpers/metrics'

  // Widget fee is charged on RFQ swaps (swap widget): https://docs.native.org/native-dev/concepts/swap-fees
const configs: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    creditVault: '0xe3D41d19564922C9952f692C5Dd0563030f5f2EF',
    routers: [
      '0x5c0abf0f651613696a5c57efafc6ab59a460b32d',
      '0x8a2ddc0461Fcf96F81a05529Bed540d4f1eb2a00',
      '0xa540ec8C73322200d68E1B86c471A5C850854f22',
    ],
    start: '2025-04-01',
  },
  [CHAIN.BSC]: {
    creditVault: '0xBA8dB0CAf781cAc69b6acf6C848aC148264Cc05d',
    routers: [
      '0xC6a5cD6C5f56D8BaAa58be5c516Bb889059651a3',
      '0xF064b069Ed18Eb5c61159247C55C5af79B28a968',
      '0x0f9f2366C6157F2aCD3C2bFA45Cd9031c152D2Cf',
    ],
    start: '2025-04-01',
  },
  [CHAIN.ARBITRUM]: {
    creditVault: '0xbA1cf8A63227b46575AF823BEB4d83D1025eff09',
    routers: [
      '0x5C0aBf0F651613696A5c57efafC6ab59A460B32d',
      '0x0FC85a171bD0b53BF0bBace74F04B66170Ae3eAb',
      '0x7d1c4889DF6113B3e4581a8c0484374bdeC3341B',
    ],
    start: '2025-07-09',
  },
  [CHAIN.BASE]: {
    creditVault: '0x74a4Cd023e5AfB88369E3f22b02440F2614a1367',
    routers: [
      '0x5C0aBf0F651613696A5c57efafC6ab59A460B32d',
      '0xaEC634d949df14Be76dC317504C7b9a6a8A5f576',
      '0xd547727b926648Af3F31DbB89E3B93E49F78dCb8',
    ],
    start: '2025-07-09',
  },
};

const Abis = {
  underlying: 'address:underlying',
  feeWith: 'address:underlying',
  allLPTokens: 'function allLPTokens(uint256) view returns (address)',
  YieldDistributed: 'event YieldDistributed(uint256 yieldAmount)',
  WidgetFeeTransfer: 'event WidgetFeeTransfer(address widgetFeeRecipient, uint256 widgetFeeRate, uint256 widgetFeeAmount, address widgetFeeToken)',
}

const calls: Array<any> = [];
for (let i = 0; i < 100; i++) {
  calls.push({ params: [i] })
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const config = configs[options.chain];

  const lpTokensAddresses = await options.api.multiCall({
    target: config.creditVault,
    abi: Abis.allLPTokens,
    calls: calls,
    permitFailure: true,
  })
  
  const lpTokens = lpTokensAddresses.filter( i => i !== null)
  const underlyingTokens = await options.api.multiCall({
    abi: Abis.underlying,
    calls: lpTokens,
  })
  
  const lpYieldsLogs = await options.getLogs({
    targets: lpTokens,
    eventAbi: Abis.YieldDistributed,
    flatten: false,
  })
  for (let i = 0; i < lpYieldsLogs.length; i++) {
    const token = underlyingTokens[i]
    const logs = lpYieldsLogs[i]
    if (token && logs) {
      for (const log of logs) {
        dailyFees.add(token, log.yieldAmount, METRIC.BORROW_INTEREST)
        dailySupplySideRevenue.add(token, log.yieldAmount, METRIC.BORROW_INTEREST)
      }
    }
  }

  const widgetFeeLogs = await options.getLogs({
    targets: config.routers,
    eventAbi: Abis.WidgetFeeTransfer,
    flatten: true,
  });

  widgetFeeLogs.forEach((log: any) => {
    dailyFees.add(log.widgetFeeToken, log.widgetFeeAmount, 'UI Widget Trading Fees');
    dailyRevenue.add(log.widgetFeeToken, log.widgetFeeAmount, 'UI Widget Trading Fees');
  })

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
}

const methodology = {
  Fees:
    'Native charges fees in two places: credit pool payouts to providers, and widget fees on swap trades.',
  Revenue:
    'Protocol revenue comes from widget fees collected on RFQ swaps.',
  ProtocolRevenue:
    'All tracked widget fees are counted as protocol revenue.',
  SupplySideRevenue:
    'Credit pool payouts are paid to providers, not the protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]:
      'Fee paid for borrowing liquidity from Native’s credit pool. This goes to providers.',
    'UI Widget Trading Fees':
      'Fee charged on each RFQ swap from natives UI.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]:
      'All credit-pool payout fees are paid out to providers.',
  },
  Revenue: {
    'UI Widget Trading Fees': 'Widget fees stay in the Native protocol treasury.'
  },
  ProtocolRevenue: {
    'UI Widget Trading Fees': 'The protocol keeps all widget fees it receives from swap trades.'
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
  methodology,
  breakdownMethodology,
};

export default adapter;
