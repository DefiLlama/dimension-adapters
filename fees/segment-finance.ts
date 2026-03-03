import { CHAIN } from "../helpers/chains";
import { compoundV2Export, } from "../helpers/compoundV2";

const adapter = compoundV2Export({
  [CHAIN.OP_BNB]: '0x71ac0e9A7113130280040d0189d0556f45a8CBB5',
  [CHAIN.BSC]: '0x57E09c96DAEE58B77dc771B017de015C38060173',
  [CHAIN.BOB]: '0xcD7C4F508652f33295F0aEd075936Cd95A4D2911',
  [CHAIN.ROOTSTOCK]: '0x2eea8fbA494d5008ba72f80E0091Cc74dB5f9926',
  [CHAIN.CORE]: '0xaba65b87eBEdB2D753b37AeCECD1E168341eE0DD',
  [CHAIN.BSQUARED]: '0x69a6B3B96b26a15A588081Df17F46d61f625741c',
}, { protocolRevenueRatio: 1 });

(adapter.adapter as any)[CHAIN.OP_BNB].start = '2024-03-21';
(adapter.adapter as any)[CHAIN.BSC].start = '2024-01-07';
(adapter.adapter as any)[CHAIN.BOB].start = '2024-04-20';
(adapter.adapter as any)[CHAIN.ROOTSTOCK].start = '2024-08-22';
(adapter.adapter as any)[CHAIN.CORE].start = '2024-08-22';
(adapter.adapter as any)[CHAIN.BSQUARED].start = '2025-01-09';

export default adapter;
