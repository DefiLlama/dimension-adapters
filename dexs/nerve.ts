
import { CHAIN } from "../helpers/chains";
import { getSaddleExports } from "../helpers/saddle";

export default getSaddleExports({
  [CHAIN.BSC]: {
    pools: [
      '0x1b3771a66ee31180906972580ade9b81afc5fcdc',
      '0x6C341938bB75dDe823FAAfe7f446925c66E6270c',
      '0x146CD24dCc9f4EB224DFd010c5Bf2b0D25aFA9C0',
      '0x0eafaa7ed9866c1f08ac21dd0ef3395e910f7114',
      '0xd0fBF0A224563D5fFc8A57e4fdA6Ae080EbCf3D3',
      '0x2dcCe1586b1664f41C72206900e404Ec3cA130e0',
    ]
  }
})