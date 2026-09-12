import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

// https://aquabank.gitbook.io/aquabank/english/aquabank/contracts
const bUSDT = "0x3c594084dc7ab1864ac69dfd01ab77e8f65b83b7";
const bUSDC = "0x038dbe3d967bb8389190446dacdfe7b95b44f73d";
const bAUSD = "0xd211b17dfe8288d4fb0dd8eeff07a6c48fc679d5";
const USDT = "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7";

const B_TOKENS = [bUSDT, bUSDC, bAUSD];

// Legacy fee destinations through 2026-01-09
// https://aquabank.gitbook.io/aquabank/english/aquabank/fees-and-revenue-model
const BUYBACK_WALLET = "0xa6fbc057e82a56ac325c1ad4245055217cf112b3"; // 10% Coral Token Buyback & Burn
const LIQUIDITY_WALLET = "0x87e21a66054fb9b335d94082f079d87f8d58d8d8"; // 5% Liquidity Reinvestment
const EXIT_FEE_WALLET = "0xd9e464f0e3918a6feb4624d22095969e53815e50"; // 0.2% exit fee (USDT)

// Fee destinations from 2026-01-10: 15% yield + 0.2% exit fees to a single ecosystem wallet
const PROTOCOL_FEE_WALLET = "0x223BBd67defAb792E66a76B7972C3cB17367d681";

const LEGACY_CUTOFF = "2026-01-10";

const fetch = async (options: FetchOptions) => {
  if (options.dateString < LEGACY_CUTOFF) {
    const dailyHoldersRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    // Track buyback wallet - goes to CORAL token holders via buyback & burn
    await addTokensReceived({
      options,
      targets: [BUYBACK_WALLET],
      tokens: B_TOKENS,
      balances: dailyHoldersRevenue,
    });

    // Track liquidity wallet - goes to protocol for liquidity provision
    await addTokensReceived({
      options,
      targets: [LIQUIDITY_WALLET],
      tokens: B_TOKENS,
      balances: dailyProtocolRevenue,
    });

    // Protocol retains 15% of yield (10% buyback + 5% liquidity)
    // Derive total yield and calculate 85% for depositors (supply-side)
    const feeFromYield = dailyProtocolRevenue.clone();
    feeFromYield.addBalances(dailyHoldersRevenue, METRIC.TOKEN_BUY_BACK);
    const dailySupplySideRevenue = feeFromYield.clone(85 / 15);

    // Track exit fee wallet - 0.2% withdrawal fee in USDT
    await addTokensReceived({
      options,
      targets: [EXIT_FEE_WALLET],
      tokens: [USDT],
      balances: dailyProtocolRevenue,
    });

    const dailyRevenue = dailyHoldersRevenue.clone();
    dailyRevenue.addBalances(dailyProtocolRevenue, METRIC.PROTOCOL_FEES);

    const dailyFees = dailyRevenue.clone();
    dailyFees.addBalances(dailySupplySideRevenue, METRIC.ASSETS_YIELDS);

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };
  }

  const protocolYield = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const exitFees = options.createBalances();

  // 15% of generated yield is retained for ecosystem liquidity
  // and protocol sustainability.
  await addTokensReceived({
    options,
    targets: [PROTOCOL_FEE_WALLET],
    tokens: B_TOKENS,
    balances: protocolYield,
  });

  // 85% of generated yield is distributed to depositors.
  const dailySupplySideRevenue = protocolYield.clone(85 / 15);

  dailyProtocolRevenue.addBalances(protocolYield, METRIC.PROTOCOL_FEES);

  // 0.2% fee charged when b-Tokens are redeemed for underlying assets.
  await addTokensReceived({
    options,
    targets: [PROTOCOL_FEE_WALLET],
    tokens: [USDT],
    balances: exitFees,
  });

  dailyProtocolRevenue.addBalances(exitFees, METRIC.PROTOCOL_FEES);

  const dailyRevenue = dailyProtocolRevenue.clone();
  const dailyFees = dailyRevenue.clone();
  dailyFees.addBalances(dailySupplySideRevenue, METRIC.ASSETS_YIELDS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total yield generated, including 15% protocol retention and 85% distributed to depositors, plus withdrawal fees.",
  Revenue: "15% of generated yield retained by the protocol, plus withdrawal fees. Through 9 January 2026 this was 10% CORAL buyback and 5% liquidity reinvestment; from 10 January 2026 it is kept in the protocol ecosystem fund.",
  HoldersRevenue: "10% of protocol yield used for CORAL token buyback and burn through 9 January 2026. None after the 10 January 2026 fee-wallet consolidation.",
  ProtocolRevenue: "5% of protocol yield for liquidity reinvestment plus 0.2% exit fees through 9 January 2026. From 10 January 2026, 15% of generated yield plus 0.2% withdrawal fees to the ecosystem fund.",
  SupplySideRevenue: "85% of yield distributed to depositors (derived from the 15% protocol retention rate).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TOKEN_BUY_BACK]: "10% of protocol yield distributed to CORAL token holders via buyback and burn through 9 January 2026",
    [METRIC.PROTOCOL_FEES]: "5% of protocol yield reserved for liquidity reinvestment plus 0.2% withdrawal exit fees through 9 January 2026; from 10 January 2026, 15% of generated yield plus 0.2% withdrawal fees retained for ecosystem liquidity and protocol sustainability",
    [METRIC.ASSETS_YIELDS]: "85% of total yield distributed to depositors as supply-side revenue",
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "10% of protocol yield distributed to CORAL token holders via buyback and burn through 9 January 2026",
    [METRIC.PROTOCOL_FEES]: "5% of protocol yield reserved for liquidity reinvestment plus 0.2% withdrawal exit fees through 9 January 2026; from 10 January 2026, 15% of generated yield plus 0.2% withdrawal fees retained for ecosystem liquidity and protocol sustainability",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "10% of protocol yield distributed to CORAL token holders via buyback and burn through 9 January 2026",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "5% of protocol yield reserved for liquidity reinvestment plus 0.2% withdrawal exit fees through 9 January 2026; from 10 January 2026, 15% of generated yield plus 0.2% withdrawal fees retained for ecosystem liquidity and protocol sustainability",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "85% of total yield distributed to depositors as supply-side revenue",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.AVAX],
  start: "2025-08-28",
  methodology,
  breakdownMethodology,
};

export default adapter;
