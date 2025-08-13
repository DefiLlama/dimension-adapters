
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

const adapter = getCurveExport(PancakeStableswapConfigs)

export default adapter;
