import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

// BaseSwap V2 is a PancakeSwap V2 fork. Factory 0xFDa6...a8BB uses PancakePair.
// Swap fee is 0.25%, and 32% of swap fees are minted to feeTo(), so the helper's
// 0.30% default overstates fees by 20%. feeTo() has been the protocol treasury
// since before the first pair. No fixed share goes to BSX/xBSX holders.
const SWAP_FEE = 0.0025;
const PROTOCOL_SHARE = 0.32; // 8/25 from _mintFee

const LABELS = {
  SwapFees: 'Token Swap Fees',
  TradingFees: 'Trading fees',
  ProtocolFees: 'Protocol fees',
  LPFees: 'LP fees',
  TokenholderFees: 'Tokenholder fees',
}

const methodology = {
  Fees: "Traders pay a 0.25% fee on every swap in BaseSwap V2 pairs.",
  UserFees: "All fees are the 0.25% swap fee paid by traders.",
  Revenue: "32% of swap fees (0.08% of volume) go to the BaseSwap protocol.",
  ProtocolRevenue: "The full 32% protocol share is collected by the BaseSwap treasury multisig.",
  SupplySideRevenue: "68% of swap fees (0.17% of volume) stay in the pools for liquidity providers.",
  HoldersRevenue: "No fixed share of swap fees is distributed to BSX/xBSX holders.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.SwapFees]: "0.25% swap fee paid by traders on BaseSwap V2 pairs.",
  },
  UserFees: {
    [LABELS.TradingFees]: "0.25% swap fee paid by traders per trade.",
  },
  Revenue: {
    [LABELS.ProtocolFees]: "32% of swap fees (0.08% of volume) going to the BaseSwap protocol.",
  },
  ProtocolRevenue: {
    [LABELS.ProtocolFees]: "32% of swap fees (0.08% of volume) collected by the BaseSwap treasury multisig.",
  },
  SupplySideRevenue: {
    [LABELS.LPFees]: "68% of swap fees (0.17% of volume) kept by liquidity providers.",
  },
  HoldersRevenue: {
    [LABELS.TokenholderFees]: "No fixed share of swap fees goes to BSX/xBSX holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV2LogAdapter({
        factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
        fees: SWAP_FEE,
        userFeesRatio: 1,
        revenueRatio: PROTOCOL_SHARE,
        protocolRevenueRatio: PROTOCOL_SHARE,
        holdersRevenueRatio: 0,
      }),
      start: '2023-07-28',
    },
  },
};

export default adapter;
