import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../helpers/uniswap";

const FACTORY = "0xFf8578C2949148A6F19b7958aE86CAAb2779CDDD";

const getUniV3LogAdapterConfig = {
  userFeesRatio: 1,
  dynamicProtocolFees: true,
  getRevenueRatio: (props: UniGetRevenueRatioProps): { _revenueRatio: number, _protocolRevenueRatio?: number } => {
    // BulbaSwap V3 is a Uniswap V3 fork. Each pool's slot0.feeProtocol sets the
    // protocol cut (1/N of swap fees). Verified on-chain: most pools have
    // feeProtocol=0 (100% of fees to LPs); a subset have feeProtocol=68 = 0x44,
    // i.e. denominator 4 on both tokens -> 25% of swap fees to protocol.
    // The factory owner (0x9876097201662D70A63C935c2f7576B35D6f45e7) collects the
    // protocol share to the treasury. There is no live BULBA token, so no holders
    // revenue; the protocol cut is booked entirely as ProtocolRevenue.
    const rate = (props.protocolFeeRatioToken0 && props.protocolFeeRatioToken1) ? (props.protocolFeeRatioToken0 + props.protocolFeeRatioToken1) / 2 : 0;
    return { _revenueRatio: rate, _protocolRevenueRatio: rate };
  }
}

async function fetch(options: FetchOptions) {
  const results = await getUniV3LogAdapter({ factory: FACTORY, ...getUniV3LogAdapterConfig })(options);

  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  if (results.dailyProtocolRevenue) {
    dailyRevenue.add(results.dailyProtocolRevenue, 'Swap Fees To Treasury')
    dailyProtocolRevenue.add(results.dailyProtocolRevenue, 'Swap Fees To Treasury')
  }
  if (results.dailySupplySideRevenue)
    dailySupplySideRevenue.add(results.dailySupplySideRevenue, 'Swap Fees To Liquidity Providers')
  else
    dailySupplySideRevenue.add(results.dailyFees, 'Swap Fees To Liquidity Providers')

  return {
    dailyVolume: results.dailyVolume,
    dailyFees: results.dailyFees.clone(1, 'Token Swap Fees'),
    dailyUserFees: results.dailyFees.clone(1, 'Token Swap Fees'),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
}

export default {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MORPH],
  start: '2024-10-19',
  methodology: {
    Volume: "Sum of the value of all token swaps across BulbaSwap V3 pools.",
    Fees: "Each swap pays that pool's fee tier (0.01%, 0.05%, 0.3% or 1%) on the amount traded.",
    UserFees: "Users pay the full swap fee (0.01% to 1% depending on the pool).",
    Revenue: "The protocol keeps 25% of swap fees on pools where the protocol fee switch is enabled; on all other pools it keeps nothing.",
    ProtocolRevenue: "The protocol's share of swap fees, collected by the factory owner to the treasury.",
    SupplySideRevenue: "Swap fees kept by liquidity providers: 100% on standard pools, 75% on pools with the protocol fee switch enabled.",
  },
  breakdownMethodology: {
    Fees: {
      "Token Swap Fees": "Swap fees paid by users, varying by pool from 0.01% to 1%.",
    },
    UserFees: {
      "Token Swap Fees": "Swap fees paid by users, varying by pool from 0.01% to 1%.",
    },
    Revenue: {
      "Swap Fees To Treasury": "Protocol's 25% share of swap fees on pools with the protocol fee switch enabled.",
    },
    ProtocolRevenue: {
      "Swap Fees To Treasury": "Protocol's 25% share of swap fees on pools with the protocol fee switch enabled.",
    },
    SupplySideRevenue: {
      "Swap Fees To Liquidity Providers": "Swap fees retained by liquidity providers after the protocol fee.",
    },
  },
}
