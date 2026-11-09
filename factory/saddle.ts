import { getSaddleExports } from "../helpers/saddle";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const dexsConfigs: Record<string, Record<string, { pools: string[]; start?: string }>> = {
  "mobius-money": {
    [CHAIN.CELO]: {
      start: '2021-11-10',
      pools: [
        "0xc0ba93d4aaf90d39924402162ee4a213300d1d60",
        "0xebf0536356256f8ff2a5eb6c65800839801d8b95",
        "0x9f4adbd0af281c69a582eb2e6fa2a594d4204cae",
        "0x74ef28d635c6c5800dd3cd62d4c4f8752daacb09",
        "0x9906589ea8fd27504974b7e8201df5bbde986b03",
        "0xf3f65dfe0c8c8f2986da0fec159abe6fd4e700b4",
        "0xaefc4e8cf655a182e8346b24c8abce45616ee0d2",
        "0xcce0d62ce14fb3e4363eb92db37ff3630836c252",
        "0xa5037661989789d0310ac2b796fa78f1b01f195d",
        "0x0986b42f5f9c42feeef66fc23eba9ea1164c916d",
        "0xa2f0e57d4ceacf025e81c76f28b9ad6e9fbe8735",
        "0xfc9e2c63370d8deb3521922a7b2b60f4cff7e75a",
        "0x23c95678862a229fac088bd9705622d78130bc3e",
        "0x02db089fb09fda92e05e92afcd41d9aafe9c7c7c",
        "0x63c1914bf00a9b395a2bf89aada55a5615a3656e",
        "0x2080aaa167e2225e1fc9923250ba60e19a180fb2",
        "0x19260b9b573569ddb105780176547875fe9feda3",
        "0xe0f2cc70e52f05edb383313393d88df2937da55a",
        "0xdbf27fd2a702cc02ac7acf0aea376db780d53247",
        "0x0ff04189ef135b6541e56f7c638489de92e9c778",
        "0x413ffcc28e6cdde7e93625ef4742810fe9738578",
        "0x382ed834c6b7dbd10e4798b08889eaed1455e820",
        "0x81b6a3d9f725ab5d706d9e552b128bc5bb0b58a1",
        "0xfa3df877f98ac5ecd87456a7accaa948462412f0",
      ],
    },
  },
  "minmax": {
    [CHAIN.IOTEX]: {
      pools: [
        "0x09A1B7d922BcfECa097b06498Bc992A83b0BCc42",
        "0x89963FCD25Cd3b369A2e0642521BCA7Cf0B9d547",
        "0xdab7B4D2CA330dde50ce611E2177271fD3Eb3F5F",
        "0x074ec23e80bd1fd26b822305614fb10b97847a35",
        "0xe409587F043f74e47eFB0C10aAf40808D4e037cE",
        "0x73541e9ffb9F4B8d13C2E5621b1Cede1981aD0d9",
        "0x2c1B1DE747043f7C7c8e0896EB33b09eD9ED55c5",
        "0xC264ED05ed2aF451732EF05C480d9e51b92a07aC",
        "0x8360D306Be83f9A992b1657Ad68fe08Ca6f2757A",
        "0x833d89FA7dD693035678AB53Be792F6F4b352C01",
        "0x7B24cAA6a497bc79FDfBAeb8A71a38F15eB3d7F7",
      ],
    },
  },
  "mm-stableswap-polygon": {
    [CHAIN.POLYGON]: {
      pools: ["0x690BBaa9EDBb762542FD198763092eaB2B2A5350"],
    },
  },
  "nerve": {
    [CHAIN.BSC]: {
      pools: [
        "0x1b3771a66ee31180906972580ade9b81afc5fcdc",
        "0x6C341938bB75dDe823FAAfe7f446925c66E6270c",
        "0x146CD24dCc9f4EB224DFd010c5Bf2b0D25aFA9C0",
        "0x0eafaa7ed9866c1f08ac21dd0ef3395e910f7114",
        "0xd0fBF0A224563D5fFc8A57e4fdA6Ae080EbCf3D3",
        "0x2dcCe1586b1664f41C72206900e404Ec3cA130e0",
      ],
    },
  },
  "zyberswap-stable": {
    [CHAIN.ARBITRUM]: {
      pools: ["0x969f7699fbB9C79d8B61315630CDeED95977Cfb8"],
    },
  },
};

const dexsProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(dexsConfigs)) {
  dexsProtocols[name] = getSaddleExports(config);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
