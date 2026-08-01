import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"
import { fetchPolymarketV2BuilderFees } from "../helpers/polymarket"

// Rainbow Wallet predictions fee wallet on Polygon
const RainbowFeeWallet = '0x757758506d6a4F8a433F8BECaFd52545f9Cb050a';

// USDC.e on Polygon
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

// Rainbow's builder code in Polymarket v2
const RAINBOW_BUILDER_CODE = '0xabce5abdc189cba6fb85edb9170e3e6e41607e946b06d112b7f87e2f2977020c';

// Polymarket v2 builder-fee window (00:00 UTC boundaries). On-chain USDC.e to the
// Rainbow fee wallet before START and again from END; builder-fee API in between.
const POLYMARKET_V2_START = 1777420800; // 2026-04-29
const POLYMARKET_V2_END = 1782691200;   // 2026-06-29

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  if (options.startTimestamp < POLYMARKET_V2_START || options.endTimestamp > POLYMARKET_V2_END) {
    const onChain = await addTokensReceived({
      options,
      targets: [RainbowFeeWallet],
      token: USDC_E,
    })
    dailyFees.add(onChain, 'Polymarket Builder Fees')
  }
  else {
    const feesResult = await fetchPolymarketV2BuilderFees({ options, builderCode: RAINBOW_BUILDER_CODE });
    dailyFees.add(feesResult.dailyFees, 'Polymarket Builder Fees');
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Rainbow charges up to 3% of each prediction market trade, with the fee shrinking as the bet gets safer. Before 2026-04-29 and again from 2026-06-29 these fees are collected on-chain as USDC.e in the Rainbow fee wallet. Between 2026-04-29 and 2026-06-29 they are the builder fees received by Rainbow from trades on Polymarket v2',
    Revenue: 'All fees go to Rainbow (on-chain periods: USDC.e to the Rainbow fee wallet; Polymarket-v2 period: builder fees from trades on Polymarket v2)',
    ProtocolRevenue: 'All fees go to Rainbow (on-chain periods: USDC.e to the Rainbow fee wallet; Polymarket-v2 period: builder fees from trades on Polymarket v2)',
  },
  breakdownMethodology: {
    Fees: {
      'Polymarket Builder Fees': 'On-chain periods (before 2026-04-29 and from 2026-06-29): USDC.e charged on each prediction market open/close trade and received by the Rainbow fee wallet. Polymarket-v2 period (2026-04-29 to 2026-06-29): builder fees received by Rainbow from trades on Polymarket v2',
    },
    Revenue: {
      'Polymarket Builder Fees': 'All trading fees flow to Rainbow (on-chain periods to the fee wallet, v2 period as builder fees on Polymarket v2)',
    },
    ProtocolRevenue: {
      'Polymarket Builder Fees': 'All trading fees flow to Rainbow (on-chain periods to the fee wallet, v2 period as builder fees on Polymarket v2)',
    },
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2025-12-01',
    }
  },
}

export default adapter
