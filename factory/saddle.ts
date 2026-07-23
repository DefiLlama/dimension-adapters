import { getSaddleExports } from "../helpers/saddle";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const dexsConfigs: Record<string, Record<string, { pools: string[] }>> = {
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
