import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { base58Decode, base58Encode, solanaRpc } from '../helpers/solana';
import ADDRESSES from '../helpers/coreAssets.json';
import pLimit from 'p-limit';

const PROGRAM = 'ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW';
const SOL_INTERFACE = 'CiNmas621VuyofiDSrEPfTXHKrdZuB6jMKECyNiMpLXE';
// Observed fee-output view tag, not a public token account. The fee is an encrypted output.
const FEE_TAG = 'FomYB8AVx4mTF3oVxgyuUPKVNAoi1ASnrNQUfDSXpw4';
const LABEL = 'Private Mode Withdrawal Fees';
// Seven mainnet deposit/withdrawal round trips on 2026-11-19 reconcile with this rate.
// https://solflare.com/static/1775.efb556ee.js sends ceil(amount * feeBps / 10000) privately.
// Example withdrawal: https://solscan.io/tx/52YXRoEyF9jfvyViM1UHaFLH9msUomLas8jRoFGfVrno1yJV8qtLGiHwgBvaea9woQQR2dkwLprSTq42BLEvHvDn
// Confirm treasury attribution and rate history before extending the historical start.
const FEE_BPS = 30n;

type Instruction = { programId: string; data?: string; accounts?: string[]; parsed?: any };

// Helius privacy Transact (tag 16), through outputs. Reference codec:
// helius-labs/zolana, sdk-libs/ts/src/interface/codecs/index.ts at e9e4000147b725cd1a51df1e43c375cc785c2df9.
function decodeWithdrawal(ix: Instruction) {
  if (!ix.data) return;
  const data = Buffer.from(base58Decode(ix.data));
  if (data[0] !== 16) return;
  let offset = 1;
  const take = (length: number) => {
    if (offset + length > data.length) throw new Error('Solflare: truncated Transact instruction');
    const result = data.subarray(offset, offset + length);
    offset += length;
    return result;
  };
  const u8 = () => take(1)[0];
  const option = () => {
    const value = u8();
    if (value > 1) throw new Error('Solflare: unknown option encoding');
    return value === 1;
  };
  take(8 + 33 + 16); // expiry, transaction viewing public key, salt
  const transfers = Array.from({ length: u8() }, () => {
    const kind = u8();
    if (kind > 3) throw new Error('Solflare: unknown interface transfer');
    const amount = take(8).readBigUInt64LE();
    if (kind >= 2) take(1); // SPL interface PDA bump
    return { kind, amount };
  });
  if (option()) take(32); // data hash
  if (option()) take(32); // ring data hash
  let hasFeeTag = false;
  for (let count = u8(); count > 0; count--) {
    take(32); // output commitment
    const kind = u8();
    let tag: string | undefined;
    if (kind === 0) tag = base58Encode(take(32));
    else if (kind === 1) {
      tag = ix.accounts?.[u8()];
      if (!tag) throw new Error('Solflare: missing owner-tag account');
    } else throw new Error('Solflare: unknown owner tag');
    hasFeeTag ||= tag === FEE_TAG;
    if (option()) take(take(2).readUInt16LE()); // encrypted output data
  }
  if (!hasFeeTag || !transfers.some(t => t.kind === 1 || t.kind === 3)) return;
  // Solflare's wallet builds one withdrawal plus the private fee output. Reject new shapes.
  if (transfers.length !== 1) throw new Error('Solflare: unsupported multi-transfer withdrawal');
  return transfers[0];
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const signatures = new Set<string>();
  let before: string | undefined;
  let reachedStart = false;
  const finalizedSlot = await solanaRpc('getSlot', [{ commitment: 'finalized' }]);
  const finalizedTime = await solanaRpc('getBlockTime', [finalizedSlot]);
  if (finalizedTime == null || finalizedTime < options.endTimestamp)
    throw new Error('Solflare: finalized chain has not reached the window end');
  // RPC history is paginated without a truncating page/transaction cap.
  while (!reachedStart) {
    const page = await solanaRpc('getSignaturesForAddress', [PROGRAM, { limit: 1000, before, commitment: 'finalized' }]);
    if (!page.length) throw new Error('Solflare: RPC history ended before the requested window');
    for (const entry of page) {
      if (entry.blockTime == null) throw new Error('Solflare: missing signature timestamp');
      if (entry.blockTime < options.startTimestamp) { reachedStart = true; break; }
      if (!entry.err && entry.blockTime < options.endTimestamp) signatures.add(entry.signature);
    }
    const next = page[page.length - 1].signature;
    if (next === before) throw new Error('Solflare: RPC pagination did not advance');
    before = next;
  }
  const limit = pLimit(5);
  await Promise.all([...signatures].map(signature => limit(async () => {
    const tx = await solanaRpc('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'finalized' }]);
    if (!tx?.meta) throw new Error(`Solflare: missing transaction ${signature}`);
    if (tx.meta.err) return;
    // A fee collector withdrawing its own private balance is a sweep, not a new customer fee.
    if (tx.transaction.message.accountKeys.some((key: any) => key.signer && key.pubkey === FEE_TAG)) return;
    const groups = new Map<number, Instruction[]>((tx.meta.innerInstructions ?? []).map((g: any) => [g.index, g.instructions]));
    // The wallet calls Transact directly. Fail on nested calls carrying the fee tag rather than silently losing them.
    for (const group of groups.values()) for (const ix of group) {
      if (ix.programId === PROGRAM && decodeWithdrawal(ix)) throw new Error('Solflare: nested withdrawal needs settlement attribution');
    }
    tx.transaction.message.instructions.forEach((ix: Instruction, index: number) => {
      if (ix.programId !== PROGRAM) return;
      const withdrawal = decodeWithdrawal(ix);
      if (!withdrawal) return;
      const transfers = groups.get(index) ?? [];
      let mint: string;
      if (withdrawal.kind === 1) {
        const paid = transfers.filter(i => i.programId === '11111111111111111111111111111111'
          && i.parsed?.type === 'transfer' && i.parsed.info.source === SOL_INTERFACE
          && Number.isSafeInteger(i.parsed.info.lamports) && BigInt(i.parsed.info.lamports) === withdrawal.amount);
        if (paid.length !== 1) throw new Error('Solflare: SOL withdrawal settlement mismatch');
        mint = ADDRESSES.solana.SOL;
      } else {
        const paid = transfers.filter(i => ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'].includes(i.programId)
          && i.parsed?.type === 'transferChecked' && BigInt(i.parsed.info.tokenAmount.amount) === withdrawal.amount
          && ix.accounts?.includes(i.parsed.info.source) && ix.accounts?.includes(i.parsed.info.mint));
        if (paid.length !== 1) throw new Error('Solflare: SPL withdrawal settlement mismatch');
        mint = paid[0].parsed.info.mint;
      }
      // Count once per withdrawal, even if multiple outputs share the fee tag.
      dailyFees.add(mint, ((withdrawal.amount * FEE_BPS + 9999n) / 10000n).toString(), LABEL);
    });
  })));
  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // The private fee's downstream revenue/supply-side allocation is not publicly observable.
  skipBreakdownValidation: true,
  fetch,
  chains: [CHAIN.SOLANA],
  // Conservatively start at the first date with independently reconciled fee-rate samples.
  start: '2026-11-19',
  methodology: {
    Fees: 'Estimated Solflare Private Mode withdrawal fees: ceil(public withdrawal amount × 0.3%) for successful Helius privacy Transact instructions containing the observed Solflare fee-output tag. Includes native SOL and SPL withdrawals; excludes private-to-private transfers, Private Send, collector sweeps, network fees and relayer fees. Rate inferred from on-chain round trips; encrypted fee amounts and collector ownership are not independently visible.',
  },
  breakdownMethodology: {
    Fees: { [LABEL]: 'Estimated fee at 30 basis points of each public withdrawal, rounded up in token base units and counted once per instruction with the observed fee-output tag. Historical coverage begins on the date the rate was reconciled on-chain.' },
  },
};
export default adapter;
