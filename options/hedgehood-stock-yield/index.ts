import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getV2Funds } from '../../helpers/hedgehood-stock-yield';

// Stock Yield by HedgeHood: option-selling vaults on tokenized stocks.
// v1 (BrokerEpochVault, Robinhood Chain): each vault sells one call a week through its quoted desk, created by the
// vault and not replaceable.
// v2 / v2.1 (EpochFund, Robinhood Chain and BNB Chain): strategy funds listed in a VaultRegistry; each fund sells
// through its option books (engines()).
// Creation/runtime verified on Sourcify:
// https://sourcify.dev/server/v2/contract/4663/0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9
// https://sourcify.dev/server/v2/contract/4663/0x6d17d089663e50823e29ad34D6e4EB2448BE8B0b
const VAULTS = [
  { // NVDA Printer (hNVDA)
    vault: '0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9',
    desk: '0x6d17d089663e50823e29ad34D6e4EB2448BE8B0b',
    stock: ADDRESSES.robinhood.NVDA,
  },
];
const DEPLOYMENT_BLOCK = 84792706; // 2026-10-10 06:36:16 UTC
const USDG = ADDRESSES.robinhood.USDG;

const ABI = {
  quotedLocked: 'event QuotedLocked(uint256 indexed epoch, address indexed buyer, bytes32 quoteDigest, uint256 premium, uint256 fee)',
  epochLocked: 'event EpochLocked(uint256 indexed epoch, uint256 stockAmount, uint256 coveredStock, uint256 strike, uint64 expiry, bytes32 instructionHash)',
};

const V2_ABI = {
  engines: 'address[]:engines',
  stock: 'address:stock',
  // emitted by a fund's option book for every position it sells: size in stock units, premium in the fund's stablecoin
  positionOpened: 'event PositionOpened(uint256 indexed epoch, uint8 indexed legId, address indexed buyer, uint8 slot, uint256 size, uint256 strike, uint256 premium, uint256 fee, bytes32 quoteDigest)',
};

async function fetchV1(options: FetchOptions, dailyNotionalVolume: any, dailyPremiumVolume: any, firstBlock: number, toBlock: number) {
  const fromBlock = Math.max(firstBlock, DEPLOYMENT_BLOCK);
  if (fromBlock > toBlock) return;
  // Every call the vault sells is an EpochLocked; a desk sale also emits QuotedLocked, with its premium, in the
  // same transaction.
  const [sales, locks] = await Promise.all([
    options.getLogs({ targets: VAULTS.map(({ desk }) => desk), eventAbi: ABI.quotedLocked, fromBlock, toBlock }),
    // One list per vault, in VAULTS order, so each lock is valued in its vault's stock
    options.getLogs({ targets: VAULTS.map(({ vault }) => vault), eventAbi: ABI.epochLocked, fromBlock, toBlock, flatten: false }),
  ]);
  locks.forEach((vaultLocks: any[], i: number) => {
    for (const lock of vaultLocks) dailyNotionalVolume.add(VAULTS[i].stock, lock.coveredStock);
  });
  // The vault's operator is the desk-only BrokerVaultDeskOperator. A call sold through the operator's own lockEpoch
  // (only if the Safe replaces it) has no premium at the sale, so it counts toward notional only.
  for (const sale of sales) dailyPremiumVolume.add(USDG, sale.premium);
}

async function fetchV2(options: FetchOptions, dailyNotionalVolume: any, dailyPremiumVolume: any, firstBlock: number, toBlock: number) {
  const v2 = await getV2Funds(options, firstBlock, toBlock);
  if (!v2) return;
  const { funds, stablecoins, fromBlock } = v2;
  const [books, stocks] = await Promise.all([
    options.api.multiCall({ abi: V2_ABI.engines, calls: funds }),
    options.api.multiCall({ abi: V2_ABI.stock, calls: funds }),
  ]);
  // one entry per option book, carrying its fund's stock and stablecoin
  const targets = books.flatMap((list: string[], i: number) => list.map((book) => ({ book, stock: stocks[i], cash: stablecoins[i] })));
  if (!targets.length) return;
  const sales = await options.getLogs({ targets: targets.map(({ book }) => book), eventAbi: V2_ABI.positionOpened, fromBlock, toBlock, flatten: false });
  sales.forEach((bookSales: any[], i: number) => {
    for (const sale of bookSales) {
      // size is the stock the position covers (a call's collateral, a put's quantity), 18 decimals like the stock token
      dailyNotionalVolume.add(targets[i].stock, sale.size);
      dailyPremiumVolume.add(targets[i].cash, sale.premium);
    }
  });
}

async function fetch(options: FetchOptions) {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  // getFromBlock() is already the block after the previous window's closing block, so adjacent pulls do not overlap
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // A failed lookup returns null: rescanning from deployment would count earlier sales again
  if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock)) throw new Error('Stock Yield: block lookup failed');
  if (options.chain === CHAIN.ROBINHOOD) await fetchV1(options, dailyNotionalVolume, dailyPremiumVolume, fromBlock, toBlock);
  await fetchV2(options, dailyNotionalVolume, dailyPremiumVolume, fromBlock, toBlock);
  return { dailyNotionalVolume, dailyPremiumVolume };
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
    NotionalVolume: 'The stock covered by each option when it is sold, valued at the stock token price: EpochLocked.coveredStock for the v1 vault, PositionOpened.size on every option book of the v2 and v2.1 funds.',
    PremiumVolume: "The premium the option buyer pays for each option the vaults sell, counted when it is sold: QuotedLocked.premium (USDG) for the v1 vault's quoted desk, PositionOpened.premium for the v2 and v2.1 funds (USDG on Robinhood Chain, USDT on BNB Chain). A trade voided within its first hour still counts here; 90% of its premium is refunded.",
  },
};

export default adapter;
