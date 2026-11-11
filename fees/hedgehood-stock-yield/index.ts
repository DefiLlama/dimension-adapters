import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getV2Funds } from '../../helpers/hedgehood-stock-yield';

// Stock Yield by HedgeHood: option-selling vaults on tokenized stocks.
// v1 (BrokerEpochVault, Robinhood Chain): depositors' stock backs one call a week, sold through the vault's quoted
// desk; the premium is paid in USDG.
// v2 / v2.1 (EpochFund, Robinhood Chain and BNB Chain): strategy funds (covered call, wheel) listed in a VaultRegistry;
// see helpers/hedgehood-stock-yield.ts.
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
  epochSettled: 'event EpochSettled(uint256 indexed epoch, bytes32 indexed digest, int256 netPnl, uint256 stockDebit, uint256 debitPrice)',
  getEpoch: `function getEpoch(uint256) view returns (${EPOCH})`,
};

const V2_ABI = {
  // one per epoch, once its last option book has settled; an epoch that sold nothing reports zeros
  epochSettled: 'event EpochSettled(uint256 indexed epoch, uint256 price, uint256 paidStock, uint256 paidUsdg, uint256 fee, uint256 income)',
};

const LABEL = 'Desk fee on option premiums';

// v2 funds: the fee is a share of each position's premium (20% at launch), fixed at the sale. The whole premium stays
// escrowed in the fund until the epoch settles; settlement books the fee to the treasury Safe's claim and the rest to
// depositors, and a voided position or an unpriced force-settlement charges none. So the fee is counted at
// settlement, from the fund's own EpochSettled, in the fund's stablecoin.
async function addV2Fees(options: FetchOptions, dailyFees: any, firstBlock: number, toBlock: number) {
  const v2 = await getV2Funds(options, firstBlock, toBlock);
  if (!v2) return;
  const { funds, stablecoins, fromBlock } = v2;
  const settled = await options.getLogs({ targets: funds, eventAbi: V2_ABI.epochSettled, fromBlock, toBlock, flatten: false });
  settled.forEach((logs: any[], i: number) => {
    for (const log of logs) dailyFees.add(stablecoins[i], BigInt(log.fee), LABEL);
  });
}

// Only the desk's fee is reported as fees. The premium itself is the buyer's payment for the option, carried by
// depositors against the risk of the call settling in the money, so it is premium volume (options adapter), not fees.
async function fetchV1(options: FetchOptions, dailyFees: any, firstBlock: number, toBlock: number) {
  // Sales are recognized when their void window closes, so they come from the window one VOID_WINDOW earlier.
  const blocks = await Promise.all([
    // the block that closed the previous window's sales, as getFromBlock() does for the window itself
    options.getBlock(options.fromTimestamp - 1 - VOID_WINDOW, options.chain, {}),
    options.getBlock(options.toTimestamp - VOID_WINDOW, options.chain, {}),
  ]);
  // A failed lookup returns null: rescanning from deployment would count earlier sales and settlements again
  if (!blocks.every(Number.isInteger)) throw new Error('Stock Yield: block lookup failed');
  const [previousSaleBlock, saleToBlock] = blocks;
  const fromBlock = Math.max(firstBlock, DEPLOYMENT_BLOCK);
  const saleFromBlock = Math.max(previousSaleBlock + 1, DEPLOYMENT_BLOCK);

  const desks = VAULTS.map(({ desk }) => desk);
  const vaults = VAULTS.map(({ vault }) => vault);
  // One list of logs per target, in VAULTS order; an empty range (before deployment) has none.
  const getLogs = (targets: string[], eventAbi: string, fromBlock: number, toBlock: number): Promise<any[][]> =>
    fromBlock <= toBlock ? options.getLogs({ targets, eventAbi, fromBlock, toBlock, flatten: false }) : Promise.resolve(targets.map(() => []));
  const [sales, voids, reported] = await Promise.all([
    getLogs(desks, ABI.quotedLocked, saleFromBlock, saleToBlock),
    // A void comes at most VOID_WINDOW after its sale, so every void of those sales is in this range.
    getLogs(desks, ABI.quotedVoided, saleFromBlock, toBlock),
    getLogs(vaults, ABI.epochSettled, fromBlock, toBlock),
  ]);

  // The desk fee is fixed at the sale as a share of the gross premium and paid to the Safe at settlement. A voided
  // sale charges no fee. Epoch ids are per vault, so a void only cancels a sale of the same desk.
  sales.forEach((deskSales, i) => {
    const voided = new Set(voids[i].map((log: any) => String(log.epoch)));
    for (const sale of deskSales) {
      if (voided.has(String(sale.epoch))) continue;
      dailyFees.add(USDG, BigInt(sale.fee), LABEL);
    }
  });

  // A call sold outside the desk (only if the Safe replaces the desk-only BrokerVaultDeskOperator) has no desk
  // sale; the fee the operator reports at settlement is counted then.
  const calls = reported.flatMap((logs, i) => logs.map((log: any) => ({ target: vaults[i], params: [log.epoch] })));
  if (calls.length) {
    const epochs = await options.api.multiCall({ abi: ABI.getEpoch, calls });
    epochs.forEach((e: any) => {
      const fee = BigInt(e.feePaid);
      if (fee !== 0n) dailyFees.add(USDG, fee, LABEL);
    });
  }
}

// Only the desk's fee is reported as fees. The premium itself is the buyer's payment for the option, carried by
// depositors against the risk of the option settling in the money, so it is premium volume (options adapter), not fees.
async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  // getFromBlock() is already the block after the previous window's closing block, so adjacent pulls do not overlap
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // A failed lookup returns null: rescanning from deployment would count earlier settlements again
  if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock)) throw new Error('Stock Yield: block lookup failed');
  if (options.chain === CHAIN.ROBINHOOD) await fetchV1(options, dailyFees, fromBlock, toBlock);
  await addV2Fees(options, dailyFees, fromBlock, toBlock);
  return { dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: '2026-10-10' },
    [CHAIN.BSC]: { start: '2026-11-02' },
  },
  methodology: {
    Fees: "The protocol's fee on the gross premium of each option the vaults sell (20% at launch). v1 vault (NVDA Printer): fixed at the sale and recognized one hour later when the Safe can no longer void the sale; a voided sale charges no fee; a call sold outside the desk (not possible with the current operator) counts the fee the operator reports at settlement. v2 and v2.1 funds (Robinhood Chain and BNB Chain): the premium stays escrowed in the fund until the epoch settles, so the fee is counted at settlement, as the fund reports it (EpochSettled.fee); voided positions and unpriced settlements charge none. The premium itself is not counted as fees: it is the buyer's payment for the option, which depositors carry against the risk of the option settling in the money (see the options adapter's premium volume).",
    Revenue: "All of the fee on the gross premium of each option the vaults sell, credited to the HedgeHood treasury Safe at settlement.",
    ProtocolRevenue: "All of the fee on the gross premium of each option the vaults sell, credited to the HedgeHood treasury Safe at settlement.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL]: 'v1: desk fee fixed at each sale (QuotedLocked.fee), zero if the sale was voided (QuotedVoided); for a call sold outside the desk, the fee recorded at settlement (getEpoch.feePaid). v2 / v2.1: the fee each fund books when an epoch settles (EpochSettled.fee), in USDG on Robinhood Chain and USDT on BNB Chain.',
    },
    Revenue: {
      [LABEL]: 'The same fee, credited to the HedgeHood treasury Safe.',
    },
    ProtocolRevenue: {
      [LABEL]: 'The same fee, credited to the HedgeHood treasury Safe.',
    },
  },
};

export default adapter;
