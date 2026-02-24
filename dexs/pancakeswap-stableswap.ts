
import { CHAIN } from "../helpers/chains";
import { ICurveDexConfig, ContractVersion, getCurveExport } from "../helpers/curve";

const PancakeStableswapConfigs: {[key: string]: ICurveDexConfig} = {
  [CHAIN.BSC]: {
    start: '2020-09-06',
    customPools: {
      [ContractVersion.crypto]: [
        '0x3EFebC418efB585248A0D2140cfb87aFcc2C63DD',
        '0xc2F5B9a3d9138ab2B74d581fC11346219eBf43Fe',
        '0x169F653A54ACD441aB34B73dA9946e2C451787EF',
        '0x176f274335c8b5fd5ec5e8274d0cf36b08e44a57',
        '0xb1da7d2c257c5700612bde35c8d7187dc80d79f1',
        '0x6d8fba276ec6f1eda2344da48565adbca7e4ffa5',
        '0x85259443fad3dc9ecfafe62f043a020992f0e4fc',
        '0x7c762fa6393df0a43730f004c868b93af696ae1e',
        '0x4d7b3f461519bac5436e50b9b9b9a9dc061de6a4',
        '0x54d5935cd89ea8df2022bbf2fe2f398490b47f67',
        '0xd791be03a4e0e4b9be62adac8a5cd4ae2813a2d6',
        '0x7a47b084fa37b88d4dda182f8ba4449963dd34bc',
        '0xb337e78c4ac4f811a0e47f61f4aba58da8e51103',
        '0xc54d35a8cfd9f6dae50945df27a91c9911a03ab1',
        '0xb8204d31379a9b317cd61c833406c972f58eccbc',
        '0xd8cb82059da7215b1a9604e845d49d3e78d0f95a',
        '0x25d0ed3b1ce5af0f3ac7da4b39b46fc409bf67e2',
        '0x49079d07ef47449af808a4f36c2a8dec975594ec',
        '0x9c138be1d76ee4c5162e0fe9d4eea5542a23d1bd',
        '0x0b03e3d6ec0c5e5bbf993ded8d947c6fb6eec18d',
        '0xff5ce4846a3708ea9befa6c3ab145e63f65dc045',
        '0xe1cf7b307d1136e12dc5c21aa790648e3b512f56',
        '0xfc17919098e9f0a0d72093e25ad052a359ae3e43',
        '0xd68baf485e4635ec6b9821036cad05cb53140160',
      ]
    }
  }
}

const stableSwapMethodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 10% of the fees.",
  SupplySideRevenue: "LPs receive 50% of the fees.",
  HoldersRevenue: "A 40% of the fees is used to facilitate CAKE buyback and burn.",
  Revenue: "Revenue is 50% of the fees paid by users.",
  Fees: "All fees comes from the user fees, which is 0.25% of each trade."
}


const adapter = getCurveExport(PancakeStableswapConfigs)

adapter.methodology = stableSwapMethodology;

export default adapter;
