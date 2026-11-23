// DefiLlama fees/revenue adapter — Lincoln Protocol (Robinhood Chain).
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { CHAIN } from "../../helpers/chains";

// pool address -> asset it custodies (zero address = native ETH); contract release v0.1.0-rc.3
const POOLS: Record<string, string> = {
  "0xF9c767CAb9B9A7dE8Dd959967269787880267ab2": ADDRESSES.null, // native ETH
  "0x5Cd4c081eb747406DAb66e22004324600f1928C9": ADDRESSES.robinhood.USDG,
  "0x4C8BAEb78b032EA3610E0F5D4C8B5Bb4fF5995f7": ADDRESSES.robinhood.NVDA,
  "0x8a29Db84A20B0A3CA528FAE0F69F50FfD39c6C39": "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", // SPY
  "0xA2078e02A631ae9218DBAa84987a24741bD24d10": ADDRESSES.robinhood.META,
  "0xE8c619705B7452c2281cA8fA675a355846D34BFE": ADDRESSES.robinhood.TSLA,
  "0x31Bd720527D9875b444c0946c5795351a56d9d8B": ADDRESSES.robinhood.GOOGL,
  "0xd4375275F5FA231e238c9FF1237A8e8666Be6B62": "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", // QQQ
  "0x207Dc4DD4E40Ab280dF9eC10CD5Edf04685e9d88": ADDRESSES.robinhood.MSTR,
};

// Eighteen immutable 30 bps fee route adapters (deployed 2026-10-17, treasury = guardian Safe).
const FEE_ADAPTERS: string[] = [
  "0x51BdAdcDC1B8B6Ed0EDe948EE4Ba1b1F48D22106", // uniswap-eth-to-usdg
  "0xf4E0376E185177EbF38773fEA3F46089733cB029", // uniswap-usdg-to-eth
  "0xf75881f178D15fF44cC4B00dAdcEbCD5e04a9296", // up-eth-to-usdg
  "0xF6d233367c3Adfa45047571BAAfBB1b3864c8eA8", // up-usdg-to-eth
  "0x39c340f193C2f6D4131A9537f005Da3385d0e0fB", // uniswap-usdg-to-nvda
  "0x829eC924A39A110B0Ea59fcDD1164a2EE6d25f42", // uniswap-nvda-to-usdg
  "0x804a2f51a04c4c552FB03743409BCbA0C6485D92", // uniswap-usdg-to-spy
  "0xDcD5b12c1dC1FfdC58045Fe306305Da705af00d9", // uniswap-spy-to-usdg
  "0x7a8454953CC392b5Ce2E267Dc0570D4D1bC65490", // uniswap-usdg-to-meta
  "0xA755940ca05Da17580982767607E42C801b7a897", // uniswap-meta-to-usdg
  "0xbF542B7195Eb402671aA30cED94114e0557ac1d5", // uniswap-usdg-to-tsla
  "0x3DaE2c98EB758685325417fc615e8980263970B3", // uniswap-tsla-to-usdg
  "0xa3eF05228fC562a7610B3d038B990f53de582862", // uniswap-usdg-to-googl
  "0xaC082BB3e0C4A6852516f25DBe0d85aB546F834A", // uniswap-googl-to-usdg
  "0x10B002942c1dcf6E93951dC85b9A41D3dA30B690", // uniswap-usdg-to-qqq
  "0x23C932B0B8C879D0D982353411D8e6Ba3Bac3aaa", // uniswap-qqq-to-usdg
  "0xb7e36f25FfDaFAbcB28DdE863C97C8ad7dC57bc2", // uniswap-usdg-to-mstr
  "0x784a20CAC13Bedcc885AEb0c3B052644582Df2F1", // uniswap-mstr-to-usdg
];

// PrivacyPool events (core rc.3 ABI). `fee` is paid by the user out of the public amount.
const PUBLIC_FLOW =
  "event PublicFlow(address indexed processor, address indexed recipient, address indexed feeRecipient, uint256 publicIn, uint256 publicOut, uint256 fee)";
const HOLDER_EXITED =
  "event HolderExited(address indexed processor, address indexed recipient, uint256 indexed commitment, uint256 nullifier, uint256 value, uint256 fee, address feeRecipient)";
// Fee route adapter event: serviceFee is sent to the treasury in the output token.
const SERVICE_FEE_PAID =
  "event ServiceFeePaid(address indexed treasury, address indexed token, uint256 grossAmountOut, uint256 serviceFee, uint256 netAmountOut)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const pools = Object.keys(POOLS);
  const flows: any[][] = await options.getLogs({ targets: pools, eventAbi: PUBLIC_FLOW, flatten: false });
  const exits: any[][] = await options.getLogs({ targets: pools, eventAbi: HOLDER_EXITED, flatten: false });
  pools.forEach((pool, i) => {
    const asset = POOLS[pool];
    for (const log of [...flows[i], ...exits[i]]) if (log.fee > 0n) dailyFees.add(asset, log.fee, "Relay fees");
  });
  if (FEE_ADAPTERS.length) {
    const swaps: any[] = await options.getLogs({ targets: FEE_ADAPTERS, eventAbi: SERVICE_FEE_PAID });
    for (const log of swaps) {
      dailyFees.add(log.token, log.serviceFee, "Swap service fees");
      dailyProtocolRevenue.add(log.token, log.serviceFee, "Swap service fees");
    }
  }
  // Relay fees are collected by the protocol-operated relays; swap fees go to the treasury Safe.
  // There are no LPs, so every fee is protocol revenue.
  return { dailyFees, dailyRevenue: dailyFees, dailyUserFees: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-17",
  methodology: {
    Fees: "Relay fees paid by users on private withdrawals, transfers and holder exits (30 bps plus a fixed gas quote), and the immutable 30 bps service fee on private swaps through the fee route adapters. Ragequit is free.",
    UserFees: "Identical to Fees: every relay fee is paid by the end user out of the amount moved.",
    Revenue: "All Relay fees. Lincoln has no liquidity providers or token holders sharing fees.",
    ProtocolRevenue: "Swap service fees are paid to the treasury Safe; relay fees accrue to the protocol-operated relays.",
  },
  breakdownMethodology: {
    Fees: {
      "Relay fees": "The `fee` field of PublicFlow and HolderExited events on each privacy pool, denominated in the pool asset.",
      "Swap service fees": "The `serviceFee` field of ServiceFeePaid events on each fee route adapter, denominated in the output token.",
    },
  },
};

export default adapter;
