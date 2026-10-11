// Shared constants for the Allbridge Classic on-chain rebuild (dexs + fees).
// Sources: https://docs.allbridge.io/allbridge-overview/bridge-contracts (addresses),
// verified bridge ABI on Etherscan (event layout).
export const BRIDGE = '0xBBbD1BbB4f9b936C3604906D7592A644071dE884'; // same Classic bridge on all EVM legs below
export const SENT_ABI = 'event Sent(bytes4 tokenSource, bytes32 tokenSourceAddress, address sender, bytes32 indexed recipient, uint256 amount, uint128 indexed lockId, bytes4 destination)'; // recipient+lockId are indexed (topics)
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// tokenSourceAddress carries the source token in the FIRST 20 bytes
// (observed: USDC 0xa0b8..eb48 and APYS 0xf741..3615 both left-aligned,
// zero-filled after; e.g. tx 0x7a89f9...6642f9 and 0x8da28b...89aaab)
export const tokenFromSourceAddress = (sourceAddress: string): string | null => {
  const hex = sourceAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const first = '0x' + hex.slice(0, 40);
  const last = '0x' + hex.slice(-40);
  if (first !== ZERO_ADDRESS) return first;
  if (last !== ZERO_ADDRESS) return last;
  return null;
};
