import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// NetNet Capital Management ($NET) — OlympusDAO-v1-style reserve currency
// protocol on Robinhood Chain (chain id 4663). The protocol's sole economic
// activity is accumulating reserves: NET is sold (bonds, genesis, premium
// sales) and taxed (5% AMM levy) in exchange for USDG that lands in the
// immutable Treasury, and the RWA Desk routes USDG into tokenized equities
// held in the NetNet RWA Sleeve. Revenue is therefore defined as treasury
// inflow. There is no redemption path for NET, so inflow is captured value,
// not custodied principal.
//
// Every address below is from the project's canonical registry:
// https://github.com/mattybcodes/netnet/blob/main/packages/sdk/src/addresses.ts
// Explorer: https://robinhoodchain.blockscout.com/address/<address>
const EXPLORER = "https://robinhoodchain.blockscout.com/address/";

const USDG = ADDRESSES.robinhood.USDG; // 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (6 dec)
// Treasury — core deploy 2026-07-16, EXPLORER + 0x04822Ea321A0DEE6F40656172F29312104855d66
const TREASURY = "0x04822Ea321A0DEE6F40656172F29312104855d66";
// NetNet RWA Sleeve — Safe v1.4.1 receiving RWA Desk fills; stock tokens are
// never sent to the Treasury contract. EXPLORER + 0x498752D5fa0600CBd613074C151Abe15B3FeC7CB
const RWA_SLEEVE = "0x498752D5fa0600CBd613074C151Abe15B3FeC7CB";
// Morpho Steakhouse USDG vault (ERC-4626) the Treasury deploys idle USDG to:
// https://app.morpho.org/robinhood-chain/vault/0xBeEff033F34C046626B8D0A041844C5d1A5409dd/steakhouse-usdg
const MORPHO_USDG_VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd";
// Morpho Blue singleton on Robinhood Chain: https://docs.morpho.org/get-started/resources/addresses/
const MORPHO_BLUE = "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010";
// USDG coming back from the Morpho position is a rebalance of existing
// reserves (Treasury.rebalanceFromMorpho), not inflow; self-transfers likewise.
const EXCLUDED_USDG_SENDERS = new Set([MORPHO_USDG_VAULT, MORPHO_BLUE, TREASURY].map((a) => a.toLowerCase()));

// Robinhood tokenized equities (Rialto-issued, 18 dec) on the RWA Desk menu.
// Each verified on-chain (symbol/decimals) and listed in the registry above.
const STOCK_TOKENS = [
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", // NVDA  — EXPLORER + address
  "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", // SPCX  — EXPLORER + address
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", // AAPL  — EXPLORER + address
  "0xe93237c50d904957cf27e7b1133b510c669c2e74", // MSFT  — EXPLORER + address
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", // GOOGL — EXPLORER + address
  "0x6330d8c3178a418788df01a47479c0ce7ccf450b", // COIN  — EXPLORER + address
];

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_ABI = "event Transfer(address indexed from, address indexed to, uint256 value)";

// Source-of-fees labels (dailyFees) and destination labels (revenue).
const USDG_INFLOW = "USDG Inflow";
const RWA_INFLOW = "RWA Inflow";
const TO_TREASURY = "Treasury";
const TO_SLEEVE = "RWA Sleeve";

const pad = (a: string) => "0x" + a.toLowerCase().replace("0x", "").padStart(64, "0");

/**
 * Sums USDG transfers into the Treasury and stock-token transfers into the
 * RWA Sleeve for the window, excluding Morpho rebalances and self-transfers.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const usdgLogs = await options.getLogs({
    target: USDG,
    eventAbi: TRANSFER_ABI,
    topics: [TRANSFER_TOPIC, null as any, pad(TREASURY)],
  });
  for (const log of usdgLogs) {
    if (EXCLUDED_USDG_SENDERS.has(String(log.from).toLowerCase())) continue;
    dailyFees.add(USDG, log.value, USDG_INFLOW);
    dailyRevenue.add(USDG, log.value, TO_TREASURY);
  }

  const rwaLogs = await options.getLogs({
    targets: STOCK_TOKENS,
    eventAbi: TRANSFER_ABI,
    topics: [TRANSFER_TOPIC, null as any, pad(RWA_SLEEVE)],
    flatten: false,
  });
  rwaLogs.forEach((logs: any[], i: number) => {
    for (const log of logs) {
      if (String(log.from).toLowerCase() === RWA_SLEEVE.toLowerCase()) continue;
      dailyFees.add(STOCK_TOKENS[i], log.value, RWA_INFLOW);
      dailyRevenue.add(STOCK_TOKENS[i], log.value, TO_SLEEVE);
    }
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-16",
  methodology: {
    Fees: "Treasury inflow — the value NetNet captures into its reserves: USDG received by the Treasury contract (genesis offering and bond sales of NET, the treasury share of the 5% AMM trading tax after TaxCollector conversion, PremiumSeller sales of NET above backing, RWA Desk reserve remittances) plus tokenized equities (Robinhood stock tokens) received by the NetNet RWA Sleeve from RWA Desk fills. USDG moving back from the Morpho vault is a rebalance of existing reserves and is excluded. NET has no redemption path, so inflow is captured value rather than custodied principal.",
    Revenue: "All treasury inflow is retained by the protocol (Treasury contract and RWA Sleeve); nothing is distributed to LPs or holders directly.",
    ProtocolRevenue: "Equal to revenue: all inflow is retained by the protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [USDG_INFLOW]: "USDG transferred into the Treasury contract from any source other than the Morpho position (bonds, tax conversion, PremiumSeller, RWA Desk remittances).",
      [RWA_INFLOW]: "Tokenized equities (NVDA, SPCX, AAPL, MSFT, GOOGL, COIN) transferred into the NetNet RWA Sleeve by RWA Desk fills.",
    },
    Revenue: {
      [TO_TREASURY]: "USDG inflow retained in the immutable Treasury contract.",
      [TO_SLEEVE]: "Tokenized equities retained in the NetNet RWA Sleeve.",
    },
    ProtocolRevenue: {
      [TO_TREASURY]: "USDG inflow retained in the immutable Treasury contract.",
      [TO_SLEEVE]: "Tokenized equities retained in the NetNet RWA Sleeve.",
    },
  },
};

export default adapter;
