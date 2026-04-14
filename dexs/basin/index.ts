import { CHAIN } from "../../helpers/chains";
import { getBasinAdapter } from "./helper";

export default getBasinAdapter({
  [CHAIN.ETHEREUM]: {
    start: '2023-08-24',
    wells: [
      '0xBEA0e11282e2bB5893bEcE110cF199501e872bAd',
      '0xbea0000113b0d182f4064c86b71c315389e4715d',
      '0x1125eac5f713503e2b7cb2299027960ce1aa5d42',
      '0x54c04c9bf5af0bc3096cb0af24c4fa8379a2915e',
      '0x905eafe9434fabacaf10d1490fcd0d1eb9b85fc8',
      '0x8d97775623368f833f8fa82209e220f1c60508ea',
      '0xdf9c4a067279857b463817ef773fe189c77e1686',
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: '2024-10-07',
    wells: [
      '0xBeA00Aa8130aCaD047E137ec68693C005f8736Ce',
      '0xBEa00BbE8b5da39a3F57824a1a13Ec2a8848D74F',
      '0xBeA00Cc9F93E9a8aC0DFdfF2D64Ba38eb9C2e48c',
      '0xBea00DDe4b34ACDcB1a30442bD2B39CA8Be1b09c',
      '0xBea00ee04D8289aEd04f92EA122a96dC76A91bd7',
      '0xbEA00fF437ca7E8354B174339643B4d1814bED33',
    ],
  },
});
