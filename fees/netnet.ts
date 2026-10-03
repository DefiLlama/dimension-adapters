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
//  - Game Fees: realized fee sweeps from the RW-PLAY cabinets (CoinFlip,
//    SPACEX Invaders, Flight Simulator, TURBO desk: 5% fee split Manager /
//    RWA Sleeve; The Button: 50% house share → Sleeve) and the Superstore's
//    backing-neutrality fee paid to the Treasury. House-edge PnL is NOT
//    counted, only explicit fees.
//  - WinNET Burn: 5% of every settled jackpot is burned (NET.burn), accruing
//    to all holders via backingPerToken — reported as holders revenue.
// Genesis offering proceeds and Morpho rebalances are not counted. Blackjack
// (rake paid in ERC-1155 chips), Climb, OTC desk and Loopback have no
// priceable fee and are omitted.
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
const NET = "0xCA9c78Dd337A67F6e0077F65F5E9218719d30eDf"; // core deploy 2026-07-16 (9 dec)
// RW-PLAY cabinets and desks (each deployed by the team; see registry).
const COINFLIP_DESK = "0xA99D15dACe9aeDE816600A31C3e4158926000f3c"; // 2026-08-10, settles in COIN
const SPACEX_DESK = "0x75EdFE49d9ec8c23A9931C5EF32eC56b2444A141"; // settles in SPCX
const FLIGHTSIM_DESK = "0xF56e517652bb18E519871ABb13A382D205f6e375"; // 2026-08-15, settles in MSFT
const BUTTON_DESK = "0xFd46AF62CF6E9306008a13beE045c542Ec3DAef6"; // $1 USDG presses, NVDA pot
const TURBO_DESK = "0x757122439420900ca44A80c390d586011FD72C8a"; // v1.1 long-dated desk (v1.0 retired, excluded)
const PACK_DESK = "0x7cf28D61D42352Eb2FD68167e9B08f73CBbF21eB"; // Superstore, 2026-07-30
const WINNET_DRAW_CONTROLLER = "0xcC4A7C03A2d4D248B8dA0E35C178944799feac70"; // 2026-07-27
const COIN = "0x6330d8c3178a418788df01a47479c0ce7ccf450b";
const SPCX = "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea";
const MSFT = "0xe93237c50d904957cf27e7b1133b510c669c2e74";
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

// RW-PLAY cabinets (CoinFlip / SPACEX / FlightSim share one shape; the
// `sleeve<Tok>` leg is the equity sweep, Sleeve USDG is converted separately).
const PLAY_FEES_SWEPT_ABI = "event FeesSwept(address indexed caller, uint256 managerTok, uint256 managerUsdg, uint256 sleeveTok)";
const PLAY_SLEEVE_CONVERTED_ABI = "event SleeveFeesConverted(address indexed caller, uint256 usdgIn, uint256 tokOut)";
const BUTTON_CONVERTED_ABI = "event Converted(uint256 usdgInPot, uint256 nvdaToPot, uint256 usdgInHouse, uint256 nvdaToSleeve)";
const TURBO_FEES_SWEPT_ABI = "event FeesSwept(address indexed caller, uint256 managerUsdg, uint256 sleeveUsdg)";
const TURBO_TOKEN_FEES_SWEPT_ABI = "event TokenFeesSwept(address indexed asset, uint256 managerTok, uint256 sleeveTok)";
const TURBO_SLEEVE_CONVERTED_ABI = "event SleeveFeesConverted(address indexed asset, uint256 usdgIn, uint256 tokensOut)";
const PACK_KEEP_ABI = "event BoxSettledKeep(uint256 indexed boxId, uint256 payoutNet, uint256 vestEnd, uint256 feeOwedUsdg, uint256 feeRemittedUsdg, uint256 ledgerAccruedUsdg)";
const PACK_UNINSTALL_ABI = "event BoxSettledUninstall(uint256 indexed boxId, uint256 reclaimUsd, uint256 escrowUnitsDelivered, uint256 bufferUnitsDelivered, uint256 usdgDelivered, uint256 ledgerPaidUsdg, uint256 bufferRefillUsdg)";
const PACK_FEE_DEBT_ABI = "event FeeDebtRepaid(address indexed payer, uint256 amount)";
const WINNET_DRAW_SETTLED_ABI = "event DrawSettled(uint256 indexed drawId, address indexed winner, uint256 prizeNet, uint256 burnedNet)";

// Source labels (dailyFees)
const BOND_PREMIUM = "Bond Premium";
const PREMIUM_SALES = "Premium Sales";
const TRADING_TAX = "Trading Tax";
const DESK_REMITTANCE = "Desk Remittance";
const RWA_INFLOW = "RWA Inflow";
const GAME_FEES = "Game Fees";
const WINNET_BURN = "WinNET Burn";
// Destination labels (revenue)
const TO_TREASURY = "Treasury";
const TO_SLEEVE = "RWA Sleeve";
const TO_TEAM = "Team";
const BURNED = "Burned";

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
  const dailyHoldersRevenue = options.createBalances();
  const addFee = (token: string, amount: any, dest: string) => {
    dailyFees.add(token, amount, GAME_FEES);
    dailyRevenue.add(token, amount, dest);
    dailyProtocolRevenue.add(token, amount, dest);
  };

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

  // --- RW-PLAY cabinets: realized fee sweeps ---
  const cabinets: [string, string][] = [[COINFLIP_DESK, COIN], [SPACEX_DESK, SPCX], [FLIGHTSIM_DESK, MSFT]];
  for (const [desk, tok] of cabinets) {
    const [swept, converted] = await Promise.all([
      options.getLogs({ target: desk, eventAbi: PLAY_FEES_SWEPT_ABI }),
      options.getLogs({ target: desk, eventAbi: PLAY_SLEEVE_CONVERTED_ABI }),
    ]);
    for (const log of swept) {
      addFee(tok, log.managerTok, TO_TEAM);
      addFee(USDG, log.managerUsdg, TO_TEAM);
      addFee(tok, log.sleeveTok, TO_SLEEVE);
    }
    for (const log of converted) addFee(USDG, log.usdgIn, TO_SLEEVE);
  }

  // The Button: house half of every $1 press, converted and sent to the Sleeve.
  const buttonLogs = await options.getLogs({ target: BUTTON_DESK, eventAbi: BUTTON_CONVERTED_ABI });
  for (const log of buttonLogs) addFee(USDG, log.usdgInHouse, TO_SLEEVE);

  // TURBO long-dated desk: open + performance fees, swept in USDG and asset units.
  const [turboUsdg, turboTok, turboConv] = await Promise.all([
    options.getLogs({ target: TURBO_DESK, eventAbi: TURBO_FEES_SWEPT_ABI }),
    options.getLogs({ target: TURBO_DESK, eventAbi: TURBO_TOKEN_FEES_SWEPT_ABI }),
    options.getLogs({ target: TURBO_DESK, eventAbi: TURBO_SLEEVE_CONVERTED_ABI }),
  ]);
  for (const log of turboUsdg) {
    addFee(USDG, log.managerUsdg, TO_TEAM);
    addFee(USDG, log.sleeveUsdg, TO_SLEEVE);
  }
  for (const log of turboTok) {
    addFee(log.asset, log.managerTok, TO_TEAM);
    addFee(log.asset, log.sleeveTok, TO_SLEEVE);
  }
  for (const log of turboConv) addFee(USDG, log.usdgIn, TO_SLEEVE);

  // Superstore: backing-neutrality fee lane paid to the Treasury (realized only).
  const [packKeep, packUninstall, packDebt] = await Promise.all([
    options.getLogs({ target: PACK_DESK, eventAbi: PACK_KEEP_ABI }),
    options.getLogs({ target: PACK_DESK, eventAbi: PACK_UNINSTALL_ABI }),
    options.getLogs({ target: PACK_DESK, eventAbi: PACK_FEE_DEBT_ABI }),
  ]);
  for (const log of packKeep) addFee(USDG, log.feeRemittedUsdg, TO_TREASURY);
  for (const log of packUninstall) addFee(USDG, log.ledgerPaidUsdg, TO_TREASURY);
  for (const log of packDebt) addFee(USDG, log.amount, TO_TREASURY);

  // WinNET: 5% of each settled jackpot is burned.
  const drawLogs = await options.getLogs({ target: WINNET_DRAW_CONTROLLER, eventAbi: WINNET_DRAW_SETTLED_ABI });
  for (const log of drawLogs) {
    dailyFees.add(NET, log.burnedNet, WINNET_BURN);
    dailyRevenue.add(NET, log.burnedNet, BURNED);
    dailyHoldersRevenue.add(NET, log.burnedNet, BURNED);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-24", // first day after genesis finalize; genesis proceeds are not counted
  methodology: {
    Fees: "Value captured by the protocol from users: (1) Bond Premium — on each BondDepository fill, NET issued × (bond price − backingPerToken), i.e. what bonders pay above the reserves the Treasury must hold against the new NET; (2) Premium Sales — USDG the PremiumSeller sweeps to the Treasury above backing when it sells newly minted NET into the pool; (3) Trading Tax — gross USDG from converting the 5% fee-on-transfer levy; (4) Desk Remittance — the RWA Desk's backing-neutrality fee paid to the Treasury on every subscription; (5) RWA Inflow — tokenized equities (Robinhood stock tokens) delivered to the NetNet RWA Sleeve by desk fills. (6) Game Fees — realized fee sweeps from the RW-PLAY cabinets (CoinFlip, SPACEX Invaders, Flight Simulator and the TURBO desk charge 5% split between the Manager and the RWA Sleeve; The Button sends 50% of every press to the Sleeve) plus the Superstore's backing-neutrality fee paid to the Treasury — house-edge PnL is not counted; (7) WinNET Burn — 5% of every settled WinNET jackpot is burned. Genesis offering proceeds, principal-like flows (backing per NET issued) and Morpho rebalances are not counted.",
    Revenue: "All captured value is retained by the protocol: USDG in the Treasury contract, equities in the RWA Sleeve, and the team share of the trading tax (currently 0%: the 4%→0% team share decayed over the 30-day pTEAM vest).",
    ProtocolRevenue: "Revenue excluding the WinNET burn: USDG in the Treasury, equities and game fees in the RWA Sleeve, and the Manager's share of game fees and trading tax.",
    HoldersRevenue: "NET burned by WinNET jackpot settlements (accrues to all holders via backing per token).",
  },
  breakdownMethodology: {
    Fees: {
      [BOND_PREMIUM]: "NET issued by BondDepository × (bond price − backingPerToken), in USDG.",
      [PREMIUM_SALES]: "USDG swept to the Treasury by PremiumSeller minus backingPerToken × NET sold.",
      [TRADING_TAX]: "Gross USDG output of TaxCollector conversions of the 5% trading levy.",
      [DESK_REMITTANCE]: "RWA Desk fee paid to the Treasury on each desk subscription.",
      [RWA_INFLOW]: "Tokenized equities (NVDA, SPCX, AAPL, MSFT, GOOGL, COIN) transferred into the NetNet RWA Sleeve.",
      [GAME_FEES]: "Realized fee sweeps from CoinFlip, SPACEX Invaders, Flight Simulator, TURBO and The Button (in USDG or the cabinet's equity token) plus the Superstore fee remitted to the Treasury.",
      [WINNET_BURN]: "NET burned at WinNET jackpot settlement (5% of the pot).",
    },
    Revenue: {
      [TO_TREASURY]: "USDG retained in the immutable Treasury contract.",
      [TO_SLEEVE]: "Tokenized equities and game fees retained in the NetNet RWA Sleeve.",
      [TO_TEAM]: "Manager share of game fees and of the trading tax (tax share decayed to 0%).",
      [BURNED]: "NET burned by WinNET.",
    },
    ProtocolRevenue: {
      [TO_TREASURY]: "USDG retained in the immutable Treasury contract.",
      [TO_SLEEVE]: "Tokenized equities and game fees retained in the NetNet RWA Sleeve.",
      [TO_TEAM]: "Manager share of game fees and of the trading tax (tax share decayed to 0%).",
    },
    HoldersRevenue: {
      [BURNED]: "NET burned by WinNET jackpot settlements.",
    },
  },
};

export default adapter;
