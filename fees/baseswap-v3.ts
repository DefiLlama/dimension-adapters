import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../helpers/uniswap";

// Stock Uniswap V3 pools (verified): protocol cut = 1/slot0.feeProtocol per pool, set by the factory owner
// (FactoryManager 0x463112327576814f80da8d3632f7bad23c853a29) to 4/4 = 25% or left at 0/0; read at the day's block.
// Collected to the treasury multisig 0xaf1823bacd8edda3b815180a61f8741fa4abc6dd, so all of it is protocol revenue.
const getRevenueRatio = ({ protocolFeeRatioToken0 = 0, protocolFeeRatioToken1 = 0 }: UniGetRevenueRatioProps) => {
  const rate = (protocolFeeRatioToken0 + protocolFeeRatioToken1) / 2
  return { _revenueRatio: rate, _protocolRevenueRatio: rate }
}

const methodology = {
  Fees: "Swap fees paid by traders at each pool's fee tier.",
  UserFees: "Swap fees paid by traders at each pool's fee tier.",
  Revenue: "Share of swap fees kept by the protocol, read per pool from slot0.feeProtocol (25% on pools where it is enabled, 0% otherwise).",
  ProtocolRevenue: "All of the protocol's share: it is collected by the FactoryManager and sent to the treasury multisig.",
  SupplySideRevenue: "The rest of the swap fees, kept by liquidity providers.",
}

const breakdownMethodology = {
  Fees: { 'Token Swap Fees': "Swap fees paid by traders at each pool's fee tier." },
  UserFees: { 'Trading fees': "Swap fees paid by traders at each pool's fee tier." },
  Revenue: { 'Protocol fees': "Per-pool protocol share of swap fees, from slot0.feeProtocol." },
  ProtocolRevenue: { 'Protocol fees': "Per-pool protocol share of swap fees, sent to the treasury." },
  SupplySideRevenue: { 'LP fees': "Swap fees left to liquidity providers after the protocol share." },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV3LogAdapter({ factory: '0x38015d05f4fec8afe15d7cc0386a126574e8077b', userFeesRatio: 1, dynamicProtocolFees: true, getRevenueRatio }),
      start: '2023-07-28',
    },
  },
};

export default adapter;
