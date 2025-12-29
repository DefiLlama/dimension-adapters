import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// https://aquabank.gitbook.io/aquabank/english/aquabank/contracts
const bUSDT = "0x3c594084dc7ab1864ac69dfd01ab77e8f65b83b7"; //Aug-21-2025
const USDT = "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7"; //
const USDC = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";
const BTCb = "0x152b9d0fdc40c096757f570a51e494bd4b943e50";
const WETHe = "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab";

const TOKENS = [bUSDT, USDT, USDC, BTCb, WETHe];

// Fee recipient wallets
// https://aquabank.gitbook.io/aquabank/english/aquabank/fees-and-revenue-model
const FEE_WALLETS = [
  "0xa6fbc057e82a56ac325c1ad4245055217cf112b3", // 10% Coral Token Buyback (bUSDT)
  "0x87e21a66054fb9b335d94082f079d87f8d58d8d8", // 5% USDT-bUSDT Liquidity (bUSDT)
  "0xd9e464f0e3918a6feb4624d22095969e53815e50", // Fee wallet (USDT)
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Track token transfers to fee wallets
  for (const wallet of FEE_WALLETS) {
    await addTokensReceived({
      options,
      targets: [wallet],
      tokens: TOKENS,
      balances: dailyFees,
    });
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Fees collected from withdrawal fees (0.2%), swap fees (0.1%), and yield retention (15%).",
  Revenue: "All fees go to the protocol for buyback and liquidity purposes.",
  ProtocolRevenue: "Same as Revenue - fees collected by AquaBank protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: "2025-11-05",
    },
  },
  methodology,
};

export default adapter;
