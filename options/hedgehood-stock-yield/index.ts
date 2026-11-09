import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Stock Yield by HedgeHood: weekly covered-call vaults (BrokerEpochVault) on Robinhood Chain stock tokens.
// Each vault sells one call a week through its quoted desk, created by the vault and not replaceable.
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

async function fetch(options: FetchOptions) {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const [previousBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // A failed lookup returns null: rescanning from deployment would count earlier sales again
  if (!Number.isInteger(previousBlock) || !Number.isInteger(toBlock)) throw new Error('Stock Yield: block lookup failed');
  // The previous window's closing block opens this one; skip it so adjacent pulls do not repeat a sale.
  const fromBlock = Math.max(previousBlock + 1, DEPLOYMENT_BLOCK);

  if (fromBlock <= toBlock) {
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
  return { dailyNotionalVolume, dailyPremiumVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-10',
  fetch,
  methodology: {
    NotionalVolume: 'The stock covered by each weekly call when it is sold (EpochLocked.coveredStock), valued at the stock token price.',
    PremiumVolume: "The premium in USDG the option buyer pays the vault for each weekly call sold through its quoted desk (QuotedLocked), counted when the call is sold. A trade voided within its first hour still counts here; 90% of its premium is refunded.",
  },
};

export default adapter;
