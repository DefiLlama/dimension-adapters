import { createHash } from 'node:crypto';
import { encodeBase58 } from 'ethers';

export const CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const discriminator = createHash('sha256').update('event:SwapEvent').digest().subarray(0, 8);
// Anchor/Borsh field order from Raydium's deployed program source:
// https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/states/events.rs
// Fee semantics (trade_fee excludes creator_fee; creator fee side is explicit):
// https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/curve/calculator.rs
export interface CpmmSwap {
  logIndex: number; pool: string; inputMint: string; outputMint: string;
  inputAmount: string; outputAmount: string; tradeFee: string; creatorFee: string;
  inputTransferFee: string; outputTransferFee: string; creatorFeeOnInput: boolean;
}
export function decodeCpmmSwap(data: Buffer, logIndex: number): CpmmSwap | null {
  if (!data.subarray(0, 8).equals(discriminator)) return null;
  if (data.length !== 170) throw new Error('Unsupported CPMM SwapEvent version');
  if (![0,1].includes(data[88]) || ![0,1].includes(data[169])) throw new Error('Invalid CPMM event boolean');
  const amount = (at: number) => data.readBigUInt64LE(at).toString();
  const mint = (at: number) => encodeBase58(data.subarray(at, at + 32));
  return { logIndex, pool: mint(8), inputMint: mint(89), outputMint: mint(121),
    inputAmount: amount(56), outputAmount: amount(64), inputTransferFee: amount(72),
    outputTransferFee: amount(80), tradeFee: amount(153), creatorFee: amount(161),
    creatorFeeOnInput: data[169] === 1 };
}
/** Track CPI frames: matching event bytes emitted by another program are not
 * Raydium events. Roll back events in any failed invocation, even if a parent
 * catches the failure and the transaction eventually succeeds. */
export function cpmmEvents(logs: unknown): CpmmSwap[] {
  if (!Array.isArray(logs) || !logs.length || logs.some(x => typeof x !== 'string'))
    throw new Error('Missing CPMM transaction logs');
  type Frame = { program: string; events: CpmmSwap[]; swaps: number; ownEvents: number };
  const stack: Frame[] = [], completed: CpmmSwap[] = [];
  for (const [index, line] of logs.entries()) {
    if (/log.*truncat/i.test(line)) throw new Error('Truncated CPMM transaction logs');
    const invoke = /^Program (\S+) invoke \[(\d+)\]$/.exec(line);
    if (invoke) {
      if (Number(invoke[2]) !== stack.length + 1) throw new Error('Incomplete invocation stack');
      stack.push({program:invoke[1],events:[],swaps:0,ownEvents:0}); continue;
    }
    const end = /^Program (\S+) (success|failed:.*)$/.exec(line);
    if (end) {
      const frame=stack.pop();
      if (!frame || frame.program !== end[1]) throw new Error('Mismatched invocation stack');
      if (end[2] === 'success') {
        if (frame.program === CPMM_PROGRAM && frame.swaps !== frame.ownEvents)
          throw new Error('CPMM swap instruction/event coverage mismatch');
        (stack.length ? stack[stack.length-1].events : completed).push(...frame.events);
      }
      continue;
    }
    const frame=stack[stack.length-1];
    if (!frame || frame.program !== CPMM_PROGRAM) continue;
    if (/^Program log: Instruction: SwapBase(Input|Output)$/.test(line)) frame.swaps++;
    const emitted=/^Program data: (\S+)$/.exec(line);
    if (!emitted) continue;
    const data=Buffer.from(emitted[1],'base64');
    if (data.toString('base64') !== emitted[1]) throw new Error('Invalid event encoding');
    const event=decodeCpmmSwap(data,index);
    if (event) { frame.events.push(event); frame.ownEvents++; }
  }
  if (stack.length) throw new Error('Unclosed invocation stack');
  return completed;
}
