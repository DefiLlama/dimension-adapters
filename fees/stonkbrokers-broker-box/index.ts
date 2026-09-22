import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ROBINHOOD_USDG } from "../stonkbrokers/helpers";

/**
 * StonkBrokers Broker Box — tokenized-stock gachapon machines on Robinhood
 * Chain (production machines deployed 2026-07-31) plus the Certificate
 * Counter OTC deed mint.
 *
 * Fee sources:
 * 1. Gachapon edge (10% of ticket: 5% StockBooster+creator / 5% protocol),
 *    read from EdgeSkimmed.
 * 2. Sell-back spread: machines buy stock back at 95% of mark; the 5% spread
 *    stays in the bankroll (implied from SoldBack / SoldBackUsdg payouts).
 * 3. Certificate Counter flat $2 fee ($1 StockBooster / $1 treasury).
 *
 * Volume: ticket notional (PullOpened.ticketWei), sell-back payouts, and
 * Certificate Counter stock purchases (CertificateBought.spendWei).
 */

const GACHA_MACHINES = [
  "0x8F1836209C42d4F6B6caA782c055eE13F8aC95b0", // GME
  "0xF9bc0777C087Af0fe7214dE8A5360bE6a71D0D44", // AAPL
  "0x2829b754784352dd2BeFfa5Eb26d5B499315b715", // AMZN
  "0xc5e3E9C2a835Ec9319Fd8C1d516fD4323c5758A0", // NVDA
  "0xFF20b4b8E08beAA4064E3ca4CC5a2E40AcaC072f", // GOOGL
  "0xfC253E0062eEf614E20E0726e5f6FF7559c35402", // MSFT
  "0x9d2c3355502be065975ad47EF5A902f02c772504", // SLV
  "0xf58979D35C3F0Ff6A6F7EDd909fE8a95a2894609", // SPCX
  "0x5B1282B6Ad40b3DC294404A2b33FF7657B66c33c", // USO
];
const CERTIFICATE_COUNTER = "0x2599882AaF5C14834562eE59ca7a3D1FFCC229D7";

const EDGE_SKIMMED = "event EdgeSkimmed(uint256 indexed roundId, uint256 creatorWei, uint256 boosterWei, uint256 protocolWei)";
const PULL_OPENED =
  "event PullOpened(uint256 indexed roundId, address indexed player, uint8 tier, bool wantCertificate, uint256 ticketWei, uint256 requestId, uint256 stockReserved)";
const SOLD_BACK = "event SoldBack(address indexed seller, uint256 stockAmount, uint256 ethOut)";
const SOLD_BACK_USDG = "event SoldBackUsdg(address indexed seller, uint256 stockAmount, uint256 usdgOut)";
const CERTIFICATE_BOUGHT =
  "event CertificateBought(uint256 indexed tokenId, address indexed buyer, address indexed recipient, address stockToken, uint256 stockAmount, uint256 spendWei, uint256 feeWei, address wallet)";

const LABELS = {
  GACHA_FEES: "Broker Box gachapon edge (10% of ticket)",
  GACHA_STOCK_DIVIDENDS: "Broker Box edge → StockBooster / creator",
  GACHA_PROTOCOL: "Broker Box edge → protocol accrual",
  GACHA_SELLBACK: "Broker Box 5% sell-back spread (retained in bankroll)",
  COUNTER_FEES: "Certificate Counter flat $2 fee",
  COUNTER_STOCK_DIVIDENDS: "Certificate Counter fee → StockBooster",
  COUNTER_PROTOCOL: "Certificate Counter fee → treasury",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [edgeLogs, pullLogs, soldBackLogs, soldBackUsdgLogs, counterLogs] = await Promise.all([
    options.getLogs({ targets: GACHA_MACHINES, eventAbi: EDGE_SKIMMED }),
    options.getLogs({ targets: GACHA_MACHINES, eventAbi: PULL_OPENED }),
    options.getLogs({ targets: GACHA_MACHINES, eventAbi: SOLD_BACK }),
    options.getLogs({ targets: GACHA_MACHINES, eventAbi: SOLD_BACK_USDG }),
    options.getLogs({ target: CERTIFICATE_COUNTER, eventAbi: CERTIFICATE_BOUGHT }),
  ]);

  // Volume: ticket notional at open + sell-back payouts + counter stock buys.
  // Fees: EdgeSkimmed (10% of settled ticket) + Certificate Counter $2 fee.
  // Official machines set creator = StockBooster, so creatorWei + boosterWei
  // both fund Clock In stock drops. protocolWei accrues for the treasury.
  for (const log of pullLogs) {
    const ticket = BigInt(log.ticketWei);
    if (ticket > 0n) dailyVolume.addGasToken(ticket);
  }
  // Sell-back pays 95% of the mark; the 5% spread stays in the machine bankroll
  // (reclaimable by treasury on official machines). Implied from payout: spread =
  // ethOut × 5/95. No separate fee event exists on-chain.
  for (const log of soldBackLogs) {
    const ethOut = BigInt(log.ethOut);
    if (ethOut <= 0n) continue;
    dailyVolume.addGasToken(ethOut);
    const spread = (ethOut * 5n) / 95n;
    if (spread > 0n) {
      dailyFees.addGasToken(spread, LABELS.GACHA_SELLBACK);
      dailyProtocolRevenue.addGasToken(spread, LABELS.GACHA_SELLBACK);
      dailyRevenue.addGasToken(spread, LABELS.GACHA_SELLBACK);
    }
  }
  for (const log of soldBackUsdgLogs) {
    const usdgOut = BigInt(log.usdgOut);
    if (usdgOut <= 0n) continue;
    dailyVolume.addToken(ROBINHOOD_USDG, usdgOut);
    const spread = (usdgOut * 5n) / 95n;
    if (spread > 0n) {
      dailyFees.addToken(ROBINHOOD_USDG, spread, LABELS.GACHA_SELLBACK);
      dailyProtocolRevenue.addToken(ROBINHOOD_USDG, spread, LABELS.GACHA_SELLBACK);
      dailyRevenue.addToken(ROBINHOOD_USDG, spread, LABELS.GACHA_SELLBACK);
    }
  }

  for (const log of edgeLogs) {
    const creator = BigInt(log.creatorWei);
    const booster = BigInt(log.boosterWei);
    const protocol = BigInt(log.protocolWei);
    const total = creator + booster + protocol;
    if (total <= 0n) continue;
    dailyFees.addGasToken(total, LABELS.GACHA_FEES);
    dailySupplySideRevenue.addGasToken(creator + booster, LABELS.GACHA_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(protocol, LABELS.GACHA_PROTOCOL);
    dailyRevenue.addGasToken(protocol, LABELS.GACHA_PROTOCOL);
  }

  for (const log of counterLogs) {
    const spend = BigInt(log.spendWei);
    const fee = BigInt(log.feeWei);
    if (spend > 0n) dailyVolume.addGasToken(spend);
    if (fee <= 0n) continue;
    const half = fee / 2n;
    const rest = fee - half; // remainder to treasury on odd wei
    dailyFees.addGasToken(fee, LABELS.COUNTER_FEES);
    dailySupplySideRevenue.addGasToken(half, LABELS.COUNTER_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(rest, LABELS.COUNTER_PROTOCOL);
    dailyRevenue.addGasToken(rest, LABELS.COUNTER_PROTOCOL);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  methodology: {
    Volume:
      "Broker Box ticket notional (PullOpened.ticketWei) + sell-back payouts (SoldBack ethOut + SoldBackUsdg usdgOut) + Certificate Counter stock purchases (CertificateBought.spendWei).",
    Fees:
      "Broker Box gachapon 10% edge (EdgeSkimmed) + the 5% sell-back spread retained in the machine bankroll + the Certificate Counter flat $2 fee.",
    Revenue: "Broker Box protocol accrual (5% of ticket) + sell-back spread + the treasury half of the Certificate Counter fee.",
    ProtocolRevenue: "Broker Box protocol accrual + sell-back bankroll spread + the treasury half of the Certificate Counter fee.",
    SupplySideRevenue:
      "Broker Box creator + booster edge (5% of ticket on official machines) → StockBooster Clock In stock drops, plus the StockBooster half of the Certificate Counter fee.",
  },
  breakdownMethodology: {
    Volume: {
      [LABELS.GACHA_FEES]: "Broker Box PullOpened.ticketWei + SoldBack/SoldBackUsdg payouts + Certificate Counter spendWei.",
    },
    Fees: {
      [LABELS.GACHA_FEES]: "10% house edge skimmed from every settled Broker Box ticket.",
      [LABELS.GACHA_SELLBACK]:
        "5% sell-back spread retained in the machine bankroll (implied from SoldBack / SoldBackUsdg payouts at 95% of mark).",
      [LABELS.COUNTER_FEES]: "Flat $2 Certificate Counter fee per OTC deed mint.",
    },
    Revenue: {
      [LABELS.GACHA_PROTOCOL]: "5% of Broker Box ticket accruing as protocol revenue.",
      [LABELS.GACHA_SELLBACK]: "5% sell-back spread retained in machine bankroll (treasury-reclaimable on official machines).",
      [LABELS.COUNTER_PROTOCOL]: "Half of the Certificate Counter $2 fee → treasury.",
    },
    ProtocolRevenue: {
      [LABELS.GACHA_PROTOCOL]: "5% of Broker Box ticket accruing as protocol revenue.",
      [LABELS.GACHA_SELLBACK]: "5% sell-back spread retained in machine bankroll (treasury-reclaimable on official machines).",
      [LABELS.COUNTER_PROTOCOL]: "Half of the Certificate Counter $2 fee → treasury.",
    },
    SupplySideRevenue: {
      [LABELS.GACHA_STOCK_DIVIDENDS]: "Broker Box creator + StockBooster edge (5% of ticket on official machines) → Clock In.",
      [LABELS.COUNTER_STOCK_DIVIDENDS]: "Half of the Certificate Counter $2 fee → StockBooster.",
    },
  },
};

export default adapter;
