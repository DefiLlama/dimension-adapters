
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
        '0xAB499095961516f058245C1395f9c0410764b6Cd',
        '0x245e8bb5427822FB8fd6cE062d8dd853FbcfABF5',
        '0x2477fB288c5b4118315714ad3c7Fd7CC69b00bf9',
        '0xfA715E7C8fA704Cf425Dd7769f4a77b81420fbF2',
        '0xc377e2648E5adD3F1CB51a8B77dBEb63Bd52c874',
        '0x556ea0b4c06d043806859c9490072faadc104b63',
        '0xc6a752948627becab5474a10821df73ff4771a49',
        '0x8D7408C2b3154F9f97fc6dd24cd36143908d1E52',
        '0x60E4ED61C6f17972559E86F2125BF8A30f249088',
        '0xf707Df3e4c70E40c2F26C660338dD0C81ad280f1',
        '0x2f8E25C21A17BD9D0C337e1b409e73bc959B41BE',
        '0x780de1A0E4613da6b65ceF7F5FB63d14CbDcfB72',
        '0xEdbb3f63C0901bA500E4525Da0c2cbD27Ac8fFdc',
      ],
    },
  }
}

const adapter = getCurveExport(EllipsisConfigs)

export default adapter;
