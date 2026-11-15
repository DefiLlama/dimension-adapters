import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getSolanaReceived } from "../helpers/token";

// GreenDildo (https://greendildo.fun, https://x.com/LaunchOnDildo): a Solana launchpad built on Raydium LaunchLab.
// Every coin is a Token-2022 token with a 1%, 2% or 3% transfer fee (the tax) on every buy, sell and transfer,
// chosen by the creator at launch. The collector wallet harvests the tax from every coin, sells it for SOL and
// pays the holder, creator and referrer shares. The platform keeps one third of every coin's tax
// (1000 of 3000 parts, see https://greendildo.fun/guide), and the collector sweeps that share to the treasury
// wallet. Treasury revenue is then split 50/50: half buys back $GREENDILDO, half is kept by the platform.
const COLLECTOR = "5XiivwbJb4zWujKUaiKjcuvk8euEEGDr2ZPSP2zH1uTo";
const TREASURY = "DVnsaAy1UN8XtWPRgv15AaUCEAzZTstXdgNgTZeaXccz";

const PLATFORM_SHARE = 1 / 3; // platform share of every coin's tax
const BUYBACK_SHARE = 0.5; // share of platform revenue spent buying back $GREENDILDO

const TOKEN_TAX = "Token Transfer Tax";
const HOLDER_REWARDS = "Coin Holder, Creator And Referrer Rewards";
const PLATFORM_KEPT = "Platform Revenue";

const fetch = async (options: FetchOptions) => {
  // The platform third of the tax, measured as SOL the collector sweeps to the treasury.
  const swept = await getSolanaReceived({ options, target: TREASURY, fromAddress: COLLECTOR });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(swept.clone(1 / PLATFORM_SHARE), TOKEN_TAX);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(swept.clone(BUYBACK_SHARE), METRIC.TOKEN_BUY_BACK);
  dailyRevenue.addBalances(swept.clone(1 - BUYBACK_SHARE), PLATFORM_KEPT);

  const dailyHoldersRevenue = swept.clone(BUYBACK_SHARE, METRIC.TOKEN_BUY_BACK);
  const dailyProtocolRevenue = swept.clone(1 - BUYBACK_SHARE, PLATFORM_KEPT);
  const dailySupplySideRevenue = swept.clone(1 / PLATFORM_SHARE - 1, HOLDER_REWARDS);

  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "The transfer tax (1%, 2% or 3%, set by each coin's creator) charged on every buy, sell and transfer of coins launched on GreenDildo.",
  UserFees: "Same as Fees: the tax is paid by traders of GreenDildo coins.",
  Revenue: "The platform's one third of every coin's tax, measured as SOL the collector wallet sweeps to the treasury.",
  ProtocolRevenue: "Half of platform revenue, kept by the platform.",
  HoldersRevenue: "Half of platform revenue, spent buying back $GREENDILDO.",
  SupplySideRevenue: "The remaining two thirds of the tax, paid to each coin's holders, its creator and, where there is one, its referrer.",
};

const breakdownMethodology = {
  Fees: {
    [TOKEN_TAX]: "Platform revenue grossed up by its fixed one third share of every coin's tax.",
  },
  UserFees: {
    [TOKEN_TAX]: "Same as Fees.",
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "Half of the SOL swept to the treasury, used to buy back $GREENDILDO.",
    [PLATFORM_KEPT]: "Half of the SOL swept to the treasury, kept by the platform.",
  },
  ProtocolRevenue: {
    [PLATFORM_KEPT]: "Half of the SOL swept to the treasury, kept by the platform.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Half of the SOL swept to the treasury, used to buy back $GREENDILDO.",
  },
  SupplySideRevenue: {
    [HOLDER_REWARDS]: "Two thirds of every coin's tax, dripped to holders of $10 or more and paid to creators and referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-11-12", // first platform sweep to the treasury
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
