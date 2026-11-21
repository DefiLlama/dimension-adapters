import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Current HyperEVM deployment; separate from Monetrix USDM and mxHYPE.
// https://hyperevmscan.io/address/0xa5E8E55329d471C9911DBeF779629E4F7bE47Ad6
const BTC_VAULT = '0xa5E8E55329d471C9911DBeF779629E4F7bE47Ad6';
// https://hyperevmscan.io/address/0x556555650f301397a433903919AFF7d414009eCB
const INSTANT_REDEEM = '0x556555650f301397a433903919AFF7d414009eCB';
// https://hyperevmscan.io/address/0x7A70d3C260EFC0A1781DF67ec71b354182dd30Af
const INSTANT_UNSTAKE = '0x7A70d3C260EFC0A1781DF67ec71b354182dd30Af';
const UBTC = '0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463';

const YIELD_DISTRIBUTED_ABI = 'event YieldDistributed(uint256 totalYield, uint256 userShare, uint256 insuranceShare, uint256 foundationShare)';
const INSTANT_EXITED_ABI = 'event InstantExited(address indexed user, uint256 inputAmount, uint256 payout, uint256 fee)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();

  // smxBTC's exchange rate increases only when this event is emitted. There
  // is no continuous on-chain gross-yield accumulator: book settled yield,
  // with the exact emitted split, rather than estimate it from mark-to-market NAV.
  const yieldLogs = await options.getLogs({ targets: [BTC_VAULT], eventAbi: YIELD_DISTRIBUTED_ABI });
  yieldLogs.forEach((log: any) => {
    dailyFees.add(UBTC, log.totalYield, 'Yield');
    dailySupplySideRevenue.add(UBTC, log.userShare, 'Yield To smxBTC Stakers');
    dailySupplySideRevenue.add(UBTC, log.insuranceShare, 'Yield To Insurance Fund');
    dailyRevenue.add(UBTC, log.foundationShare, 'Yield To Foundation');
    dailyProtocolRevenue.add(UBTC, log.foundationShare, 'Yield To Foundation');
  });

  // Redeem fees are UBTC; unstake fees are mxBTC, redeemable 1:1 for UBTC.
  // Both fee fields are 8 decimals, even though unstake input shares have 14.
  const exitLogs = await options.getLogs({
    targets: [INSTANT_REDEEM, INSTANT_UNSTAKE],
    eventAbi: INSTANT_EXITED_ABI,
  });
  exitLogs.forEach((log: any) => {
    dailyFees.add(UBTC, log.fee, 'Instant Exit Fees');
    dailyRevenue.add(UBTC, log.fee, 'Instant Exit Fees');
    dailyProtocolRevenue.add(UBTC, log.fee, 'Instant Exit Fees');
    dailyUserFees.add(UBTC, log.fee, 'Instant Exit Fees');
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyUserFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.HYPERLIQUID],
  fetch,
  // First deposit and instant exits in this deployment occurred on October 13.
  start: '2026-10-13',
  pullHourly: true,
  methodology: {
    Fees: "Settled yield from mxBTC's HyperCore funding strategy after borrowing and trading costs, converted to UBTC and measured at distribution, plus instant redeem/unstake fees; excludes unsettled strategy income.",
    Revenue: "The foundation's share of settled mxBTC yield plus instant redeem/unstake fees, valued in UBTC.",
    ProtocolRevenue: "The foundation's share of settled mxBTC yield plus instant redeem/unstake fees retained by the protocol, valued in UBTC.",
    SupplySideRevenue: "Settled yield allocated to smxBTC stakers and the insurance-fund reserve that backstops mxBTC.",
    UserFees: "Instant redeem/unstake fees paid by users to skip the delayed exit flow, valued in UBTC.",
  },
  breakdownMethodology: {
    Fees: {
      'Yield': "Total UBTC-denominated yield distributed by the BtcVault.",
      'Instant Exit Fees': "UBTC redeem fees and mxBTC unstake fees, valued at the 1:1 UBTC redemption rate.",
    },
    Revenue: {
      'Yield To Foundation': "The foundation share of distributed yield.",
      'Instant Exit Fees': "Instant redeem/unstake fees retained by the protocol.",
    },
    ProtocolRevenue: {
      'Yield To Foundation': "The foundation share of distributed yield.",
      'Instant Exit Fees': "Instant redeem/unstake fees retained by the protocol.",
    },
    SupplySideRevenue: {
      'Yield To smxBTC Stakers': "The staker share of distributed yield injected into smxBTC.",
      'Yield To Insurance Fund': "The share of distributed yield sent to the insurance reserve.",
    },
    UserFees: {
      'Instant Exit Fees': "Instant redeem/unstake fees paid by users.",
    },
  },
};

export default adapter;
