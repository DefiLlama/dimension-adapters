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
  [CHAIN.XLAYER]: {
    creditVault: '0x4Df7557734B382EB542BEa6c74786D398DF4CC19',
    routers: [
      '0x45F4D4AED68A04E9a48EED69E1C8b15d7875d25F',
      '0xFF12771C74A9394477C2ce53F82b67C93d5D7B82',
    ],
    start: '2026-05-13',
  },
  [CHAIN.ROBINHOOD]: {
    creditVault: '0x57B8f68ef57Af2dB70BC9aAc891836661CA4cB51',
    routers: [
      '0xa5ec1f0aC784C3620fFDcdf2A7DbcEF9DA658ea4',
      '0xe7D5083b8cA725258552da45C781ED04eF079C7f',
    ],
    start: '2026-06-16',
  },
};

const Abis = {
  EpochUpdated: 'event EpochUpdated((address trader, (address token, uint256 fundingFee, uint256 reserveFee)[] feeUpdates)[] accruedFundingFees)',
  WidgetFeeTransfer: 'event WidgetFeeTransfer(address widgetFeeRecipient, uint256 widgetFeeRate, uint256 widgetFeeAmount, address widgetFeeToken)',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const config = configs[options.chain];

  // Each epoch the credit vault charges borrowers and splits it: fundingFee to LP holders, reserveFee to Native
  const epochLogs = await options.getLogs({
    target: config.creditVault,
    eventAbi: Abis.EpochUpdated,
  });

  for (const log of epochLogs as any[]) {
    for (const trader of log.accruedFundingFees) {
      for (const { token, fundingFee, reserveFee } of trader.feeUpdates) {
        if (fundingFee > 0) {
          dailyFees.add(token, fundingFee, METRIC.BORROW_INTEREST)
          dailySupplySideRevenue.add(token, fundingFee, METRIC.BORROW_INTEREST)
        }
        if (reserveFee > 0) {
          dailyFees.add(token, reserveFee, METRIC.BORROW_INTEREST)
          dailyRevenue.add(token, reserveFee, 'Credit Pool Fees To Treasury')
        }
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
    dailyRevenue.add(log.widgetFeeToken, log.widgetFeeAmount, 'Widget Fees To Treasury');
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
    'Interest market makers pay to borrow from Native credit pools, plus the widget fee a front-end can add to a swap. Native takes nothing on the swap itself - a market maker earns from the price it quotes, so that is not counted here.',
  Revenue:
    'The slice of borrow interest Native reserves for itself plus any widget fee it collects. Both are zero today: the reserve rate is set to 0 and no widget fees are being charged.',
  ProtocolRevenue:
    'Same as revenue - everything Native keeps goes to its treasury.',
  SupplySideRevenue:
    'The borrow interest paid out to the liquidity providers who funded the credit pools.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]:
      'Interest charged to market makers each epoch for borrowing credit pool liquidity.',
    'UI Widget Trading Fees':
      'Fee a front-end adds on top of a swap quote, taken from the token the trader is selling.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]:
      'The part of that interest handed to credit pool depositors.',
  },
  Revenue: {
    'Credit Pool Fees To Treasury':
      'The part of borrow interest Native reserves for itself instead of paying depositors.',
    'Widget Fees To Treasury': 'Widget fees sent to the recipient Native signs off on.',
  },
  ProtocolRevenue: {
    'Credit Pool Fees To Treasury':
      'The part of borrow interest Native reserves for itself instead of paying depositors.',
    'Widget Fees To Treasury': 'Widget fees sent to the recipient Native signs off on.',
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
