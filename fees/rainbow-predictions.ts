import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"
import { fetchPolymarketV2BuilderFees } from "../helpers/polymarket"

// Rainbow Wallet predictions fee wallet on Polygon (pre-Polymarket-v2)
const RainbowFeeWallet = '0x757758506d6a4F8a433F8BECaFd52545f9Cb050a';

// USDC.e on Polygon (used pre-Polymarket-v2)
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

// Rainbow's builder code in Polymarket v2
const RAINBOW_BUILDER_CODE = '0xabce5abdc189cba6fb85edb9170e3e6e41607e946b06d112b7f87e2f2977020c';

// 2026-04-29 00:00 UTC — Polymarket v2 cutover. Before: on-chain. On/after: API.
const POLYMARKET_V2_CUTOVER = 1777420800;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  // On-chain leg: capture USDC.e transfers to the Rainbow fee wallet
  // (only meaningful pre-Polymarket-v2; for windows fully after, this returns 0)
  if (options.startTimestamp < POLYMARKET_V2_CUTOVER) {
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
    Fees: 'Pre-Polymarket-v2: ~1% of shares value on each prediction market trade routed through the Rainbow fee wallet. Post-Polymarket-v2: Builder fees received by Rainbow from trades on Polymarket v2',
    Revenue: 'Builder fees received by Rainbow from trades on Polymarket v2',
    ProtocolRevenue: 'Builder fees received by Rainbow from trades on Polymarket v2',
  },
  breakdownMethodology: {
    Fees: {
      'Polymarket Builder Fees': 'Pre-v2: USDC.e charged on each prediction market open/close trade. Post-v2: Builder fees received by Rainbow from trades on Polymarket v2',
    },
    Revenue: {
      'Polymarket Builder Fees': 'Builder fees received by Rainbow from trades on Polymarket using Rainbow builder interface',
    },
    ProtocolRevenue: {
      'Polymarket Builder Fees': 'Builder fees received by Rainbow from trades on Polymarket using Rainbow builder interface',
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