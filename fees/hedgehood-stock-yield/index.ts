import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Stock Yield by HedgeHood: weekly covered-call vaults (BrokerEpochVault) on Robinhood Chain stock tokens.
// Depositors' stock backs one call a week, sold to a quoted option buyer; the premium is paid in USDG.
// Creation/runtime verified on Sourcify:
// https://sourcify.dev/server/v2/contract/4663/0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9
// https://sourcify.dev/server/v2/contract/4663/0x6d17d089663e50823e29ad34D6e4EB2448BE8B0b (its quoted desk)
const VAULTS = [
  '0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9', // NVDA Printer (hNVDA)
];
const DEPLOYMENT_BLOCK = 84792706; // 2026-10-10 06:36:16 UTC
const USDG = ADDRESSES.robinhood.USDG;

const EPOCH = 'tuple(uint64 lockedAt,uint64 expiry,uint64 settledAt,uint256 stockAtLock,uint256 sharesAtLock,uint256 maxCoveredStock,uint256 strike,uint256 minPremium,uint256 stockMultiplier,bytes32 instructionHash,bytes32 executionHash,uint256 filledStock,uint256 grossPremium,int256 netPnl,uint256 stockDebit,uint256 debitPrice,bytes32 settlementHash,uint64 frozenAt,uint256 feePaid,int256 userNetPnl,uint64 executedAt,uint256 lossCoverage,bytes32 historyContextHash)';
const ABI = {
  quotedEpochSettled: 'event QuotedEpochSettled(uint256 indexed epoch, address indexed buyer, uint256 price, uint256 buyerStock, uint256 premium, uint256 fee)',
  epochSettled: 'event EpochSettled(uint256 indexed epoch, bytes32 indexed digest, int256 netPnl, uint256 stockDebit, uint256 debitPrice)',
  getEpoch: `function getEpoch(uint256) view returns (${EPOCH})`,
};

const LABELS = {
  premiums: 'Covered-call premiums net of option payouts',
  deskFee: 'Desk fee on option premiums',
  depositors: 'Covered-call result to vault depositors',
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [previousBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // A failed lookup returns null: rescanning from deployment would count earlier settlements again
  if (!Number.isInteger(previousBlock) || !Number.isInteger(toBlock)) throw new Error('Stock Yield: block lookup failed');
  // The previous window's closing block opens this one; skip it so adjacent pulls do not repeat a settlement.
  const fromBlock = Math.max(previousBlock + 1, DEPLOYMENT_BLOCK);

  if (fromBlock <= toBlock) {
    for (const vault of VAULTS) {
      // A traded epoch settles through the desk (QuotedEpochSettled); an epoch nobody traded is closed with a zero
      // settleEpoch (EpochSettled). Each settlement emits one of the two, and its accounting is final in getEpoch.
      const [quoted, reported] = await Promise.all([ABI.quotedEpochSettled, ABI.epochSettled].map(eventAbi =>
        options.getLogs({ target: vault, eventAbi, fromBlock, toBlock })));
      const epochIds = [...quoted, ...reported].map((log: any) => log.epoch);
      if (!epochIds.length) continue;
      const epochs = await options.api.multiCall({ target: vault, abi: ABI.getEpoch, calls: epochIds });
      epochs.forEach((e: any, i: number) => {
        const netPnl = BigInt(e.netPnl);
        const fee = BigInt(e.feePaid);
        const userNetPnl = BigInt(e.userNetPnl);
        // netPnl = premium kept (less any void refund) minus the option payout; the desk fee comes out of the premium
        // and the rest is the depositors' result. Only operator loss coverage breaks that split, and it is unreachable
        // while the vault's operator is the desk-only BrokerVaultDeskOperator; stop rather than misattribute it if the
        // Safe ever replaces the operator.
        if (BigInt(e.settledAt) === 0n || BigInt(e.lossCoverage) !== 0n || netPnl !== fee + userNetPnl)
          throw new Error(`Stock Yield: epoch ${epochIds[i]} of ${vault} does not split as fee + depositor result`);
        dailyFees.add(USDG, netPnl, LABELS.premiums);
        dailyRevenue.add(USDG, fee, LABELS.deskFee);
        dailySupplySideRevenue.add(USDG, userNetPnl, LABELS.depositors);
      });
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-10',
  fetch,
  // A week in which the call finishes deep in the money costs depositors more than its premium: a realized loss,
  // reported as negative fees and supply-side revenue.
  allowNegativeValue: true,
  methodology: {
    Fees: "Each settled weekly epoch's option result in USDG: the premium the buyer paid (less the 90% refunded if the desk voids the trade) minus the value of the stock the buyer receives when the call finishes in the money. Recognized when the epoch settles; negative when the payout exceeds the premium.",
    Revenue: "The desk's fee on the gross premium (20% at launch), fixed when the call is sold and paid to the HedgeHood treasury Safe at settlement. No fee is charged on a voided trade.",
    ProtocolRevenue: "The same desk fee, paid to the HedgeHood treasury Safe.",
    SupplySideRevenue: "Premium net of the desk fee and any void refund, minus the option payout: what the vault's depositors gain or lose for the week, paid as USDG rewards or deducted from their stock.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.premiums]: 'Option premium kept by the vault minus the in-the-money payout to the option buyer, from each settled epoch (getEpoch.netPnl).',
    },
    Revenue: {
      [LABELS.deskFee]: 'Desk fee on gross premium recorded for the epoch (getEpoch.feePaid), credited to the treasury Safe at settlement.',
    },
    ProtocolRevenue: {
      [LABELS.deskFee]: 'Desk fee on gross premium recorded for the epoch (getEpoch.feePaid), credited to the treasury Safe at settlement.',
    },
    SupplySideRevenue: {
      [LABELS.depositors]: "Depositors' share of the epoch (getEpoch.userNetPnl): premium after the desk fee and any void refund, less the option payout.",
    },
  },
};

export default adapter;
