import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// https://aquabank.gitbook.io/aquabank/english/aquabank/contracts
const bUSDT = "0x3c594084dc7ab1864ac69dfd01ab77e8f65b83b7";
const bUSDC = "0x038dbe3d967bb8389190446dacdfe7b95b44f73d";
const bAUSD = "0xd211b17dfe8288d4fb0dd8eeff07a6c48fc679d5";
const USDT = "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7";

const B_TOKENS = [bUSDT, bUSDC, bAUSD];

// https://aquabank.gitbook.io/aquabank/english/aquabank/fees-and-revenue-model
const BUYBACK_WALLET = "0xa6fbc057e82a56ac325c1ad4245055217cf112b3"; // 10% Coral Token Buyback & Burn
const LIQUIDITY_WALLET = "0x87e21a66054fb9b335d94082f079d87f8d58d8d8"; // 5% Liquidity Reinvestment
const EXIT_FEE_WALLET = "0xd9e464f0e3918a6feb4624d22095969e53815e50"; // 0.2% exit fee (USDT)

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
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

  // Track exit fee wallet - 0.2% withdrawal fee in USDT
  await addTokensReceived({
    options,
    targets: [EXIT_FEE_WALLET],
    tokens: [USDT],
    balances: dailyProtocolRevenue,
  });

  // Protocol retains 15% of yield (10% buyback + 5% liquidity)
  // Derive total yield and calculate 85% for depositors (supply-side)
  const protocolFees = options.createBalances();
  protocolFees.addBalances(dailyHoldersRevenue);
  protocolFees.addBalances(dailyProtocolRevenue);

  const dailySupplySideRevenue = protocolFees.clone(85 / 15);

  // Total fees = protocol fees (15%) + supply-side yield (85%)
  dailyFees.addBalances(protocolFees);
  dailyFees.addBalances(dailySupplySideRevenue);

  const dailyRevenue = dailyFees.clone();

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total yield generated, including 15% protocol retention and 85% distributed to depositors.",
  Revenue: "All fees are distributed between protocol, token holders, and depositors.",
  HoldersRevenue:
    "10% of protocol yield used for CORAL token buyback and burn.",
  ProtocolRevenue: "5% of protocol yield reserved for liquidity reinvestment, plus 0.2% exit fees.",
  SupplySideRevenue: "85% of yield distributed to depositors (derived from 15% protocol retention rate).",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: "2025-08-28",
    },
  },
  methodology,
};

export default adapter;
