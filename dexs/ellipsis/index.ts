
import { CHAIN } from "../../helpers/chains";
import { ICurveDexConfig, getCurveExport } from "../../helpers/curve";

const EllipsisConfigs: {[key: string]: ICurveDexConfig} = {
  [CHAIN.BSC]: {
    start: '2020-09-06',
    factory_crypto: [
      '0x41871A4c63d8Fae4855848cd1790ed237454A5C4',
      '0x8433533c5B67C4E18FA06935f73891B28a10932b',
    ],
    stable_factory: [
      '0xa5d748a3234A81120Df7f23c9Ea665587dc8d871',
      '0xf65BEd27e96a367c61e0E06C54e14B16b84a5870',
    ],
    customPools: {
      stable_factory: [
        '0x160caed03795365f3a589f10c379ffa7d75d4e76',
        '0x19ec9e3f7b21dd27598e7ad5aae7dc0db00a806d',
      ],
    },
  }
}

const adapter = getCurveExport(EllipsisConfigs)

export default adapter;
