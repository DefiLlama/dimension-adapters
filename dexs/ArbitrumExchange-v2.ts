import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

// ArbDexPair (Sourcify exact match, e.g. 0x101009f8a54f52d7210bcb755aba44984ffa2fb7) charges a fixed `swapFee = 25` (0.25%, no setter).
// `_mintFee` mints 20/(5,20) of the sqrt(k) growth to factory feeTo => 80% of swap fees to the protocol, 20% stay with LPs.
// feeTo is a 2-of-5 Safe (0xe8ffe751dea181025a9acf3d6bde8cda5380f53f), set 2023-03-07 and never changed.
const SWAP_FEE = 0.0025
const PROTOCOL_SHARE = 0.8

// Until 2024-03-06 the Safe sent the fee LP to owner EOA 0x7ea1643383221677e066b74913eE5ecE7Aa3B4Fa (2023-08-29, 09-23, 09-28,
// 2024-02-15, 2024-03-06), which funded the ARX/xARX staking reward pools 0x75Bca51be93E97FF7D3198506f368b472730265a (ARX -> WETH),
// 0x2a18D189505E9b8CCB7d69C9163942389108AB25 (ARX -> USDC.e), 0xf4752a5f352459948620e7C377b10ddcC92015c8 (ARX -> ARB) and
// 0x4cB69d9D05f7a4b30D99FCe79e3841173C8D2d2E (xARX). No fee LP has left the Safe since then, so later fees stay with the protocol.
const STAKER_DISTRIBUTION_END = 1709769600 // 2024-03-07 00:00 UTC

const customLogic = ({ dailyVolume, dailyFees, fetchOptions }: any) => {
  const dailyUserFees = fetchOptions.createBalances();
  const dailyRevenue = fetchOptions.createBalances();
  const dailyProtocolRevenue = fetchOptions.createBalances();
  const dailyHoldersRevenue = fetchOptions.createBalances();
  const dailySupplySideRevenue = fetchOptions.createBalances();

  dailyUserFees.addBalances(dailyFees, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addBalances(dailyFees.clone(1 - PROTOCOL_SHARE), 'Swap Fees To LPs');

  if (fetchOptions.startTimestamp < STAKER_DISTRIBUTION_END) {
    dailyRevenue.addBalances(dailyFees.clone(PROTOCOL_SHARE), 'Swap Fees To ARX Stakers');
    dailyHoldersRevenue.addBalances(dailyFees.clone(PROTOCOL_SHARE), 'Swap Fees To ARX Stakers');
  } else {
    dailyRevenue.addBalances(dailyFees.clone(PROTOCOL_SHARE), 'Swap Fees To Protocol');
    dailyProtocolRevenue.addBalances(dailyFees.clone(PROTOCOL_SHARE), 'Swap Fees To Protocol');
  }

  return {
    dailyVolume,
    dailyFees: dailyUserFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const fetch = getUniV2LogAdapter({
  factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c',
  fees: SWAP_FEE,
  customLogic,
});

const methodology = {
  Volume: "Value of tokens swapped on Arbitrum Exchange V2 pairs.",
  Fees: "0.25% swap fee paid by traders on every trade.",
  UserFees: "Traders pay a 0.25% swap fee on every trade.",
  Revenue: "80% of swap fees (0.20% of volume), minted as LP tokens to the protocol's fee multisig. It went to ARX stakers until March 6, 2024, and has stayed with the protocol since.",
  ProtocolRevenue: "80% of swap fees (0.20% of volume) kept in the protocol's fee multisig since March 7, 2024. Before that, this share went to ARX stakers.",
  HoldersRevenue: "80% of swap fees (0.20% of volume), paid out as ARX and xARX staking rewards until March 6, 2024. Nothing since.",
  SupplySideRevenue: "20% of swap fees (0.05% of volume), kept in the pools for liquidity providers.",
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: "0.25% swap fee paid by traders on every trade."
  },
  Fees: {
    [METRIC.SWAP_FEES]: "0.25% swap fee paid by traders on every trade."
  },
  Revenue: {
    'Swap Fees To ARX Stakers': "80% of swap fees, minted as LP tokens to the fee multisig and paid out as ARX and xARX staking rewards, until March 6, 2024.",
    'Swap Fees To Protocol': "80% of swap fees, minted as LP tokens to the protocol's fee multisig and kept there, since March 7, 2024.",
  },
  ProtocolRevenue: {
    'Swap Fees To Protocol': "80% of swap fees, minted as LP tokens to the protocol's fee multisig and kept there, since March 7, 2024.",
  },
  HoldersRevenue: {
    'Swap Fees To ARX Stakers': "80% of swap fees, minted as LP tokens to the fee multisig and paid out as ARX and xARX staking rewards, until March 6, 2024.",
  },
  SupplySideRevenue: {
    'Swap Fees To LPs': "20% of swap fees, kept in the pools for liquidity providers."
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2023-03-14',
  methodology,
  breakdownMethodology,
};

export default adapter;
