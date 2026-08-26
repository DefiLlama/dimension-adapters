import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { ChainApi } from "@defillama/sdk";

// NetNet Capital Management ($NET) — OlympusDAO-v1-style reserve currency
// protocol on Robinhood Chain (chain id 4663).
//
// Fees are the value the protocol CAPTURES from users, not gross flows:
//  - Bond Premium: bonders pay `priceWad` USDG per NET; the Treasury only has
//    to back each new NET at `backingPerToken`. The spread (price − backing)
//    × NET issued is retained value that accrues to existing holders.
//  - Premium Sales: PremiumSeller mints NET and sells it above backing into
//    the canonical pool; captured = USDG swept − backing × NET sold.
//  - Trading Tax: 5% fee-on-transfer on AMM buys/sells, converted to USDG by
//    TaxCollector (gross, team + treasury shares).
//  - Desk Remittance: the RWA Desk's backing-neutrality fee paid to Treasury
//    on every desk subscription.
//  - RWA Inflow: tokenized equities delivered to the NetNet RWA Sleeve by
//    desk fills (the equity leg of desk subscriptions).
// Genesis offering proceeds and Morpho rebalances are not counted.
//
// Every address is from the project's canonical registry:
// https://github.com/mattybcodes/netnet/blob/main/packages/sdk/src/addresses.ts
// Explorer: https://robinhoodchain.blockscout.com/address/<address>
const USDG = ADDRESSES.robinhood.USDG; // 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (6 dec)
const TREASURY = "0x04822Ea321A0DEE6F40656172F29312104855d66"; // core deploy 2026-07-16
const BOND_DEPOSITORY = "0xff32a969A0c567129eECD926D04657728E1980C1"; // core deploy 2026-07-16
const PREMIUM_SELLER = "0x346e1a31171A0f7aC73909010b5435768d3B5462"; // core deploy 2026-07-16
const TAX_COLLECTOR = "0x086C58400b8708Ef993f256E12e752dcF0AC918e"; // core deploy 2026-07-16
const RWA_DESK = "0x99B6eE6eDe47d9a8a9bfd03F728a99B789df1961"; // deployed 2026-07-24
// NetNet RWA Sleeve — Safe v1.4.1 receiving RWA Desk fills; stock tokens are
// never sent to the Treasury contract.
const RWA_SLEEVE = "0x498752D5fa0600CBd613074C151Abe15B3FeC7CB";
// Robinhood tokenized equities (Rialto-issued, 18 dec) on the RWA Desk menu.
const STOCK_TOKENS = [
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", // NVDA
  "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", // SPCX
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", // AAPL
  "0xe93237c50d904957cf27e7b1133b510c669c2e74", // MSFT
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", // GOOGL
  "0x6330d8c3178a418788df01a47479c0ce7ccf450b", // COIN
];

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_ABI = "event Transfer(address indexed from, address indexed to, uint256 value)";
const BOND_CREATED_ABI = "event BondCreated(address indexed depositor, uint256 indexed marketId, uint256 amountIn, uint256 payout, uint256 priceWad)";
const PREMIUM_SOLD_ABI = "event PremiumSold(uint256 netSold, uint256 usdgSweptRaw)";
const CONVERTED_ABI = "event Converted(uint256 netIn, uint256 usdgOutRaw, uint256 teamUsdgRaw, uint256 treasuryUsdgRaw)";
const DESK_BOND_ABI = "event DeskBond(address indexed to, address indexed rwaToken, uint256 usdgIn, uint256 payout, uint256 priceWad, uint256 fee, uint256 rwaOut)";

// Source labels (dailyFees)
const BOND_PREMIUM = "Bond Premium";
const PREMIUM_SALES = "Premium Sales";
const TRADING_TAX = "Trading Tax";
const DESK_REMITTANCE = "Desk Remittance";
const RWA_INFLOW = "RWA Inflow";
// Destination labels (revenue)
const TO_TREASURY = "Treasury";
const TO_SLEEVE = "RWA Sleeve";
const TO_TEAM = "Team";

const pad = (a: string) => "0x" + a.toLowerCase().replace("0x", "").padStart(64, "0");

// NET has 9 decimals, USDG 6; backingPerToken / priceWad are WAD USDG per
// whole NET. USDG raw captured = payout × (price − backing) / 1e21.
const SCALE = 10n ** 21n;
const spreadUsdg = (netRaw: bigint, priceWad: bigint, backingWad: bigint): bigint => {
  if (priceWad <= backingWad) return 0n;
  return (netRaw * (priceWad - backingWad)) / SCALE;
};

/**
 * Aggregates protocol-captured value for the window: bond and premium-sale
 * spreads over backing, gross trading tax, desk remittance fees, and
 * tokenized equities delivered to the RWA Sleeve.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // Backing per NET (WAD) read at the latest block: public Robinhood Chain
  // RPCs are not archive nodes. backingPerToken is monotone non-decreasing by
  // protocol invariant, so this is conservative (never overstates the spread)
  // for any historical window.
  const latest = new ChainApi({ chain: options.chain });
  const backingWad = BigInt(await latest.call({ target: TREASURY, abi: "uint256:backingPerToken" }));

  const [bondLogs, premiumLogs, taxLogs, deskLogs] = await Promise.all([
    options.getLogs({ target: BOND_DEPOSITORY, eventAbi: BOND_CREATED_ABI }),
    options.getLogs({ target: PREMIUM_SELLER, eventAbi: PREMIUM_SOLD_ABI }),
    options.getLogs({ target: TAX_COLLECTOR, eventAbi: CONVERTED_ABI }),
    options.getLogs({ target: RWA_DESK, eventAbi: DESK_BOND_ABI }),
  ]);

  for (const log of bondLogs) {
    const v = spreadUsdg(BigInt(log.payout), BigInt(log.priceWad), backingWad);
    dailyFees.add(USDG, v, BOND_PREMIUM);
    dailyRevenue.add(USDG, v, TO_TREASURY);
    dailyProtocolRevenue.add(USDG, v, TO_TREASURY);
  }

  for (const log of premiumLogs) {
    const usdg = BigInt(log.usdgSweptRaw);
    const backingCost = (BigInt(log.netSold) * backingWad) / SCALE;
    const v = usdg > backingCost ? usdg - backingCost : 0n;
    dailyFees.add(USDG, v, PREMIUM_SALES);
    dailyRevenue.add(USDG, v, TO_TREASURY);
    dailyProtocolRevenue.add(USDG, v, TO_TREASURY);
  }

  for (const log of taxLogs) {
    dailyFees.add(USDG, log.usdgOutRaw, TRADING_TAX);
    dailyRevenue.add(USDG, log.treasuryUsdgRaw, TO_TREASURY);
    dailyRevenue.add(USDG, log.teamUsdgRaw, TO_TEAM);
    dailyProtocolRevenue.add(USDG, log.treasuryUsdgRaw, TO_TREASURY);
    dailyProtocolRevenue.add(USDG, log.teamUsdgRaw, TO_TEAM);
  }

  for (const log of deskLogs) {
    dailyFees.add(USDG, log.fee, DESK_REMITTANCE);
    dailyRevenue.add(USDG, log.fee, TO_TREASURY);
    dailyProtocolRevenue.add(USDG, log.fee, TO_TREASURY);
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
      dailyProtocolRevenue.add(STOCK_TOKENS[i], log.value, TO_SLEEVE);
    }
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-24", // first day after genesis finalize; genesis proceeds are not counted
  methodology: {
    Fees: "Value captured by the protocol from users: (1) Bond Premium — on each BondDepository fill, NET issued × (bond price − backingPerToken), i.e. what bonders pay above the reserves the Treasury must hold against the new NET; (2) Premium Sales — USDG the PremiumSeller sweeps to the Treasury above backing when it sells newly minted NET into the pool; (3) Trading Tax — gross USDG from converting the 5% fee-on-transfer levy; (4) Desk Remittance — the RWA Desk's backing-neutrality fee paid to the Treasury on every subscription; (5) RWA Inflow — tokenized equities (Robinhood stock tokens) delivered to the NetNet RWA Sleeve by desk fills. Genesis offering proceeds, principal-like flows (backing per NET issued) and Morpho rebalances are not counted.",
    Revenue: "All captured value is retained by the protocol: USDG in the Treasury contract, equities in the RWA Sleeve, and the team share of the trading tax (currently 0%: the 4%→0% team share decayed over the 30-day pTEAM vest).",
    ProtocolRevenue: "Equal to revenue; nothing is paid to LPs or third parties.",
  },
  breakdownMethodology: {
    Fees: {
      [BOND_PREMIUM]: "NET issued by BondDepository × (bond price − backingPerToken), in USDG.",
      [PREMIUM_SALES]: "USDG swept to the Treasury by PremiumSeller minus backingPerToken × NET sold.",
      [TRADING_TAX]: "Gross USDG output of TaxCollector conversions of the 5% trading levy.",
      [DESK_REMITTANCE]: "RWA Desk fee paid to the Treasury on each desk subscription.",
      [RWA_INFLOW]: "Tokenized equities (NVDA, SPCX, AAPL, MSFT, GOOGL, COIN) transferred into the NetNet RWA Sleeve.",
    },
    Revenue: {
      [TO_TREASURY]: "USDG retained in the immutable Treasury contract.",
      [TO_SLEEVE]: "Tokenized equities retained in the NetNet RWA Sleeve.",
      [TO_TEAM]: "Team share of the trading tax (decayed to 0%).",
    },
    ProtocolRevenue: {
      [TO_TREASURY]: "USDG retained in the immutable Treasury contract.",
      [TO_SLEEVE]: "Tokenized equities retained in the NetNet RWA Sleeve.",
      [TO_TEAM]: "Team share of the trading tax (decayed to 0%).",
    },
  },
};

export default adapter;
