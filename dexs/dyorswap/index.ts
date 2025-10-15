import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.MODE]: {
    factory: '0xE470699f6D0384E3eA68F1144E41d22C6c8fdEEf',
    start: '2023-11-20',
    fees: 0.003,  // 0.30%
    userFeesRatio: 1,
    revenueRatio: 0, // no protocol fee
  },
  [CHAIN.BLAST]: {
    factory: '0xA1da7a7eB5A858da410dE8FBC5092c2079B58413',
    start: '2024-03-01',
    fees: 0.003,  // 0.30%
    userFeesRatio: 1,
    revenueRatio: 0, // no protocol fee
  },
  [CHAIN.PLASMA]: {
    factory: '0xA9F2c3E18E22F19E6c2ceF49A88c79bcE5b482Ac',
    start: 1871833,
    fees: 0.003,  // 0.30%
    userFeesRatio: 1,
    revenueRatio: 0, // no protocol fee
  },
  // [CHAIN.INK]: {
  //   factory: '0x6c86ab200661512fDBd27Da4Bb87dF15609A2806',
  //   start: '2024-12-18',
  //   fees: 0.003,  // 0.30%
  //   userFeesRatio: 1,
  //   revenueRatio: 0, // no protocol fee
  // },
  // [CHAIN.SONIC]: {
  //   factory: '0xd8863d794520285185197F97215c8B8AD04E8815',
  //   start: '2024-12-12',
  //   fees: 0.003,  // 0.30%
  //   userFeesRatio: 1,
  //   revenueRatio: 0, // no protocol fee
  // },
  // [CHAIN.SONEIUM]: {
  //   factory: '0x4f0c1b4c6FdF983f2d385Cf24DcbC8c68f345E40',
  //   start: '2024-12-22',
  //   fees: 0.003,  // 0.30%
  //   userFeesRatio: 1,
  //   revenueRatio: 0, // no protocol fee
  // },
  // [CHAIN.UNICHAIN]: {
  //   factory: '0x6c86ab200661512fDBd27Da4Bb87dF15609A2806',
  //   start: '2024-11-13',
  //   fees: 0.003,  // 0.30%
  //   userFeesRatio: 1,
  //   revenueRatio: 0, // no protocol fee
  // },
}, { runAsV1: true });
