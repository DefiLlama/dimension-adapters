
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
