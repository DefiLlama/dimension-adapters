import { SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getUniV2LogAdapter } from '../helpers/uniswap';

// Camelot V2 is a Uniswap V2 fork with dual-liquidity model (volatile & stable pairs)
// Fee: 0.3% total swap fee
// Fee breakdown: 60% LPs, 22.5% xGRAIL holders, 17.5% protocol (5% operating + 12.5% buyback/burn)
// Source: https://docs.camelot.exchange/tokenomics/protocol-earnings
// Architecture: https://docs.camelot.exchange/protocol/amm-v2

const FEES = 0.003; // 0.3%
const USER_FEES_RATIO = 1; // Users pay 100% of fees
const REVENUE_RATIO = 0.4; // 40% protocol revenue (17.5% protocol + 22.5% holders)
const PROTOCOL_REVENUE_RATIO = 0.175; // 17.5% (5% operating + 12.5% buyback/burn)
const HOLDERS_REVENUE_RATIO = 0.225; // 22.5% xGRAIL holders

const methodology = {
  Fees: 'Trading fees charged on swaps. Camelot V2 is a Uniswap V2 fork with 0.3% swap fee.',
  UserFees: 'Users pay 0.3% fee on each swap.',
  Revenue:
    'Portion of trading fees that goes to the protocol (17.5%) and xGRAIL holders (22.5%), totaling 40% of swap fees.',
  ProtocolRevenue:
    '17.5% of trading fees (5% operating expenses + 12.5% GRAIL buyback/burn).',
  HoldersRevenue:
    '22.5% of trading fees go to xGRAIL holders via Real Yield Staking.',
  SupplySideRevenue: '60% of trading fees go to liquidity providers.',
};

const adapterConfig = {
  fees: FEES,
  userFeesRatio: USER_FEES_RATIO,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
  holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APECHAIN]: {
      fetch: getUniV2LogAdapter({ factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', ...adapterConfig }),
      start: '2024-10-15',
    },
    [CHAIN.ARBITRUM]: {
      fetch: getUniV2LogAdapter({ factory: '0x6EcCab422D763aC031210895C81787E87B43A652', ...adapterConfig }),
      start: '2022-11-22',
    },
    [CHAIN.GRAVITY]: {
      fetch: getUniV2LogAdapter({ factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', ...adapterConfig }),
      start: '2024-07-04',
    },
    [CHAIN.RARI]: {
      fetch: getUniV2LogAdapter({ factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', ...adapterConfig }),
      start: '2024-06-05',
    },
    [CHAIN.REYA]: {
      fetch: getUniV2LogAdapter({ factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', ...adapterConfig }),
      start: '2024-06-20',
    },
    [CHAIN.SANKO]: {
      fetch: getUniV2LogAdapter({ factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', ...adapterConfig }),
      start: '2024-04-17',
    },
  },
};

adapter.methodology = methodology;

export default adapter;
