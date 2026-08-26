import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// NetNet Capital Management ($NET) — OlympusDAO-v1-style reserve protocol on
// Robinhood Chain. Revenue is defined as treasury inflow: USDG arriving at the
// Treasury contract (genesis proceeds, bond sales, the treasury share of the
// 5% trading tax after conversion, PremiumSeller sweeps, RWA Desk reserve
// remittances) plus tokenized equities arriving at the NetNet RWA Sleeve
// (Rialto fills routed by the RWA Desk). Addresses: github.com/mattybcodes/netnet
// packages/sdk/src/addresses.ts.
const USDG = ADDRESSES.robinhood.USDG;
const TREASURY = "0x04822Ea321A0DEE6F40656172F29312104855d66";
const RWA_SLEEVE = "0x498752D5fa0600CBd613074C151Abe15B3FeC7CB";
// USDG coming back from the Morpho position is a rebalance, not inflow.
const MORPHO_USDG_VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd";
const MORPHO_BLUE = "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010";
const EXCLUDED_USDG_SENDERS = new Set([MORPHO_USDG_VAULT, MORPHO_BLUE, TREASURY].map((a) => a.toLowerCase()));

const STOCK_TOKENS = [
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", // NVDA
  "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", // SPCX
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", // AAPL
  "0xe93237c50d904957cf27e7b1133b510c669c2e74", // MSFT
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", // GOOGL
  "0x6330d8c3178a418788df01a47479c0ce7ccf450b", // COIN
];

const TRANSFER_ABI = "event Transfer(address indexed from, address indexed to, uint256 value)";
const USDG_INFLOW = "USDG Inflow";
const RWA_INFLOW = "RWA Inflow";

const pad = (a: string) => "0x" + a.toLowerCase().replace("0x", "").padStart(64, "0");

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const usdgLogs = await options.getLogs({
    target: USDG,
    eventAbi: TRANSFER_ABI,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null as any,
      pad(TREASURY),
    ],
  });
  for (const log of usdgLogs) {
    if (EXCLUDED_USDG_SENDERS.has(String(log.from).toLowerCase())) continue;
    dailyFees.add(USDG, log.value, USDG_INFLOW);
  }

  const rwaLogs = await options.getLogs({
    targets: STOCK_TOKENS,
    eventAbi: TRANSFER_ABI,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null as any,
      pad(RWA_SLEEVE),
    ],
    flatten: false,
  });
  rwaLogs.forEach((logs: any[], i: number) => {
    for (const log of logs) {
      if (String(log.from).toLowerCase() === RWA_SLEEVE.toLowerCase()) continue;
      dailyFees.add(STOCK_TOKENS[i], log.value, RWA_INFLOW);
    }
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-16",
  methodology: {
    Fees: "Treasury inflow: USDG received by the NetNet Treasury contract (genesis offering proceeds, bond sales, the treasury share of the 5% trading tax after conversion to USDG, PremiumSeller sweeps and RWA Desk reserve remittances) plus tokenized equities (Robinhood stock tokens) received by the NetNet RWA Sleeve. USDG moving back from the Morpho vault is a rebalance and is excluded.",
    Revenue: "All treasury inflow is retained by the protocol treasury.",
    ProtocolRevenue: "All treasury inflow is retained by the protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [USDG_INFLOW]: "USDG transferred into the Treasury contract from any source other than the Morpho position.",
      [RWA_INFLOW]: "Tokenized equities (NVDA, SPCX, AAPL, MSFT, GOOGL, COIN) transferred into the NetNet RWA Sleeve.",
    },
  },
};

export default adapter;
