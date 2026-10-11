import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Stock Yield by HedgeHood: weekly covered-call vaults (BrokerEpochVault) on Robinhood Chain stock tokens.
// Depositors' stock backs one call a week, sold through the vault's quoted desk; the premium is paid in USDG.
// Creation/runtime verified on Sourcify:
// https://sourcify.dev/server/v2/contract/4663/0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9
// https://sourcify.dev/server/v2/contract/4663/0x6d17d089663e50823e29ad34D6e4EB2448BE8B0b (its quoted desk)
const VAULTS = [
  { // NVDA Printer (hNVDA)
    vault: '0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9',
    desk: '0x6d17d089663e50823e29ad34D6e4EB2448BE8B0b',
  },
];
const DEPLOYMENT_BLOCK = 84792706; // 2026-10-10 06:36:16 UTC
const USDG = ADDRESSES.robinhood.USDG;
// BrokerVaultQuotedDesk.VOID_WINDOW: the Safe can void a sale until an hour after it, so a sale is final only then
const VOID_WINDOW = 3600;

const EPOCH = 'tuple(uint64 lockedAt,uint64 expiry,uint64 settledAt,uint256 stockAtLock,uint256 sharesAtLock,uint256 maxCoveredStock,uint256 strike,uint256 minPremium,uint256 stockMultiplier,bytes32 instructionHash,bytes32 executionHash,uint256 filledStock,uint256 grossPremium,int256 netPnl,uint256 stockDebit,uint256 debitPrice,bytes32 settlementHash,uint64 frozenAt,uint256 feePaid,int256 userNetPnl,uint64 executedAt,uint256 lossCoverage,bytes32 historyContextHash)';
const ABI = {
  quotedLocked: 'event QuotedLocked(uint256 indexed epoch, address indexed buyer, bytes32 quoteDigest, uint256 premium, uint256 fee)',
  quotedVoided: 'event QuotedVoided(uint256 indexed epoch, address indexed buyer, uint256 refund, bytes32 reasonHash)',
  quotedEpochSettled: 'event QuotedEpochSettled(uint256 indexed epoch, address indexed buyer, uint256 price, uint256 buyerStock, uint256 premium, uint256 fee)',
  epochSettled: 'event EpochSettled(uint256 indexed epoch, bytes32 indexed digest, int256 netPnl, uint256 stockDebit, uint256 debitPrice)',
  getEpoch: `function getEpoch(uint256) view returns (${EPOCH})`,
};

const LABELS = {
  premiums: 'Covered-call premiums net of option payouts',
  deskFee: 'Desk fee on option premiums',
  depositors: 'Covered-call premiums to depositors net of option payouts',
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // Sales are recognized when their void window closes, so they come from the window one VOID_WINDOW earlier.
  const blocks = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
    options.getBlock(options.fromTimestamp - VOID_WINDOW, options.chain, {}),
    options.getBlock(options.toTimestamp - VOID_WINDOW, options.chain, {}),
  ]);
  // A failed lookup returns null: rescanning from deployment would count earlier sales and settlements again
  if (!blocks.every(Number.isInteger)) throw new Error('Stock Yield: block lookup failed');
  const [previousBlock, toBlock, previousSaleBlock, saleToBlock] = blocks;
  // The previous window's closing block opens this one; skip it so adjacent pulls do not repeat an event.
  const fromBlock = Math.max(previousBlock + 1, DEPLOYMENT_BLOCK);
  const saleFromBlock = Math.max(previousSaleBlock + 1, DEPLOYMENT_BLOCK);

  for (const { vault, desk } of VAULTS) {
    if (saleFromBlock > toBlock) break; // before deployment
    const [sales, voids, settlements, reported] = await Promise.all([
      saleFromBlock <= saleToBlock ? options.getLogs({ target: desk, eventAbi: ABI.quotedLocked, fromBlock: saleFromBlock, toBlock: saleToBlock }) : [],
      // A void comes at most VOID_WINDOW after its sale, so every void of those sales is in this range, as is any
      // void settled in this window.
      options.getLogs({ target: desk, eventAbi: ABI.quotedVoided, fromBlock: saleFromBlock, toBlock }),
      fromBlock <= toBlock ? options.getLogs({ target: vault, eventAbi: ABI.quotedEpochSettled, fromBlock, toBlock }) : [],
      fromBlock <= toBlock ? options.getLogs({ target: vault, eventAbi: ABI.epochSettled, fromBlock, toBlock }) : [],
    ]);
    const refunds = new Map(voids.map((log: any) => [String(log.epoch), BigInt(log.refund)]));

    // The premium is paid into the vault at the sale and the desk fee is fixed then. A voided sale refunds 90% of
    // the premium to the buyer, charges no fee, and depositors keep the rest.
    for (const sale of sales) {
      const premium = BigInt(sale.premium);
      const refund = refunds.get(String(sale.epoch));
      const fee = refund === undefined ? BigInt(sale.fee) : 0n;
      const kept = premium - (refund ?? 0n);
      dailyFees.add(USDG, kept, LABELS.premiums);
      dailyRevenue.add(USDG, fee, LABELS.deskFee);
      dailySupplySideRevenue.add(USDG, kept - fee, LABELS.depositors);
    }

    // At expiry a call in the money pays the buyer stock worth its intrinsic value, out of depositors' stock.
    // A void also settles the epoch through the desk, with no payout.
    const settled = settlements.filter((log: any) => !refunds.has(String(log.epoch)));
    if (settled.length) {
      const epochs = await options.api.multiCall({ target: vault, abi: ABI.getEpoch, calls: settled.map((log: any) => log.epoch) });
      epochs.forEach((e: any, i: number) => {
        const premium = BigInt(settled[i].premium);
        const netPnl = BigInt(e.netPnl); // premium - intrinsic payout
        const payout = premium - netPnl;
        if (BigInt(e.settledAt) === 0n || payout < 0n || BigInt(e.feePaid) + BigInt(e.userNetPnl) !== netPnl)
          throw new Error(`Stock Yield: epoch ${settled[i].epoch} of ${vault} does not settle as premium - payout`);
        if (payout === 0n) return; // out of the money
        dailyFees.add(USDG, -payout, LABELS.premiums);
        dailySupplySideRevenue.add(USDG, -payout, LABELS.depositors);
      });
    }

    // An epoch nobody bought a call for is closed with a zero settleEpoch. A nonzero one would be a call sold
    // outside the desk, impossible while the vault's operator is the desk-only BrokerVaultDeskOperator; stop rather
    // than misattribute it if the Safe ever replaces the operator.
    for (const log of reported)
      if (BigInt(log.netPnl) !== 0n) throw new Error(`Stock Yield: epoch ${log.epoch} of ${vault} settled outside the desk`);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-10',
  fetch,
  // A call settling in the money pays the buyer at expiry, days after its premium was recognized: that period's fees
  // and supply-side revenue are negative.
  allowNegativeValue: true,
  methodology: {
    Fees: "Premiums the vault earns selling a weekly call, recognized one hour after each sale when the Safe can no longer void it (net of the 90% refunded if it did), minus the value of the stock the buyer receives when a call settles in the money at expiry.",
    Revenue: "The desk's fee on each sale's gross premium (20% at launch), fixed at the sale and recognized with it; paid to the HedgeHood treasury Safe at settlement. No fee is charged on a voided sale.",
    ProtocolRevenue: "The same desk fee, paid to the HedgeHood treasury Safe.",
    SupplySideRevenue: "Each sale's premium after the desk fee (or after the refund, if voided), recognized with the sale, minus the payout to the option buyer at expiry: what depositors gain or lose, paid as USDG rewards or deducted from their stock.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.premiums]: 'Premium paid by the option buyer for each sale (QuotedLocked.premium), less the refund if the sale was voided (QuotedVoided.refund), one hour after the sale; minus the intrinsic value paid to the buyer in stock when a call settles in the money (premium - getEpoch.netPnl).',
    },
    Revenue: {
      [LABELS.deskFee]: 'Desk fee on gross premium fixed at each sale (QuotedLocked.fee), zero if the sale was voided.',
    },
    ProtocolRevenue: {
      [LABELS.deskFee]: 'Desk fee on gross premium fixed at each sale (QuotedLocked.fee), zero if the sale was voided.',
    },
    SupplySideRevenue: {
      [LABELS.depositors]: "Premium kept by the vault less the desk fee, credited to depositors as USDG rewards at settlement; minus the intrinsic value paid to the option buyer out of depositors' stock when a call settles in the money.",
    },
  },
};

export default adapter;
