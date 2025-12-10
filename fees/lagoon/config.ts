import { CHAIN } from "../../helpers/chains";

interface FactoryConfig {
  address: string;
  fromBlock: number;
}

interface InfraConfig {
  [key: string]: {
    start: string;

    factories: Array<FactoryConfig>;

    // custom vaults
    vaults: Array<string>;
  }
}

export const InfraConfigs: InfraConfig = {
  [CHAIN.ETHEREUM]: {
    start: '2025-01-01',
    factories: [
      {
        address: '0x8D6f5479B14348186faE9BC7E636e947c260f9B1', // optinProxyFactory
        fromBlock: 22940919,
      },
      {
        address: '0x09C8803f7Dc251f9FaAE5f56E3B91f8A6d0b70ee', // beaconFactory
        fromBlock: 22218451,
      },
    ],
    vaults: [
      '0x07ed467acD4ffd13023046968b0859781cb90D9B', // 9Summits Flagship ETH
      '0x03D1eC0D01b659b89a87eAbb56e4AF5Cb6e14BFc', // 9Summits Flagship USDC
      '0xB09F761Cb13baCa8eC087Ac476647361b6314F98', // 9Summits & Tulipa Capital cbBTC
      '0x8092cA384D44260ea4feaf7457B629B8DC6f88F0', // Usual Invested USD0++ in stUSR
      '0x66dCB62da5430D800a1c807822C25be17138fDA8', // Unity Trust
      '0x71652D4898DE9A7DD35e472a5fe4577eC69d82f2', // Trinity Trust
      '0x7895a046b26cc07272b022a0c9bafc046e6f6396', // Noon tacUSN
      '0x8245FD9Ae99A482dFe76576dd4298f799c041D61', // Usual Invested USD0++ in USCC & USTB
      '0xaf87b90e8a3035905697e07bb813d2d59d2b0951', // Usual Invested USD0++ in TAC
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: '2025-03-12',
    factories: [
      {
        address: '0x9De724B0efEe0FbA07FE21a16B9Bf9bBb5204Fb4',
        fromBlock: 358686643,
      },
      {
        address: '0x58a7729125acA9e5E9C687018E66bfDd5b2D4490',
        fromBlock: 324144504,
      },
    ],
    vaults: [
      '0x99CD0b8b32B15922f0754Fddc21323b5278c5261',
    ],
  },
  [CHAIN.AVAX]: {
    start: '2025-03-23',
    factories: [
      {
        address: '0xC094C224ce0406BC338E00837B96aD2e265F7287',
        fromBlock: 65620725,
      },
      {
        address: '0x5E231C6D030a5c0f51Fa7D0F891d3f50A928C685',
        fromBlock: 62519141,
      },
    ],
    vaults: [],
  },
  [CHAIN.BASE]: {
    start: '2025-01-01',
    factories: [
      {
        address: '0x6FC0F2320483fa03FBFdF626DDbAE2CC4B112b51',
        fromBlock: 32988756,
      },
      {
        address: '0xC953Fd298FdfA8Ed0D38ee73772D3e21Bf19c61b',
        fromBlock: 29100401,
      },
    ],
    vaults: [
      "0xFCE2064B4221C54651B21c868064a23695E78f09", // 722Capital-ETH
      "0x8092cA384D44260ea4feaf7457B629B8DC6f88F0", // DeTrade Core USDC
      "0xB09F761Cb13baCa8eC087Ac476647361b6314F98", // 722Capital-USDC
    ],
  },
  [CHAIN.LINEA]: {
    start: '2025-09-10',
    factories: [
      {
        address: '0x8D6f5479B14348186faE9BC7E636e947c260f9B1',
        fromBlock: 23119208,
      },
    ],
    vaults: [],
  },
  [CHAIN.MONAD]: {
    start: '2025-11-18',
    factories: [
      {
        address: '0xcCdC4d06cA12A29C47D5d105fED59a6D07E9cf70',
        fromBlock: 36249718,
      },
    ],
    vaults: [],
  },
  //  [CHAIN.BERACHAIN]: {
  //   start: '2025-04-23',
  //   factories: [
  //     {
  //       address: '0x245d1C095a0fFa6f1Af0f7Df81818DeFc9Cfc69D',
  //       fromBlock: 7858746,
  //     },
  //     {
  //       address: '0x7CF8cF276450BD568187fDC0b0959D30eC599853',
  //       fromBlock: 4061769,
  //     },
  //   ],
  //   vaults: [],
  // },
  // [CHAIN.PLASMA]: {
  //   start: '2025-10-01',
  //   factories: [
  //     {
  //       address: '0xF838E8Bd649fc6fBC48D44E9D87273c0519C45c9',
  //       fromBlock: 2236159,
  //     },
  //   ],
  //   vaults: [],
  // },
  // [CHAIN.TAC]: {
  //   start: '2025-07-10',
  //   factories: [
  //     {
  //       address: '0x66Ab87A9282dF99E38C148114F815a9C073ECA8D',
  //       fromBlock: 2334460,
  //     },
  //     {
  //       address: '0x3e39E287B4c94aC18831A63E5a6183Aa42cd85c3',
  //       fromBlock: 1817048,
  //     },
  //   ],
  //   vaults: [],
  // },
}