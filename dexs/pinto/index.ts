import { CHAIN } from "../../helpers/chains";
import { getBasinAdapter } from "../basin";

export default getBasinAdapter({
  [CHAIN.BASE]: {
    start: '2024-11-19',
    wells: [
      '0x3e11001CfbB6dE5737327c59E10afAB47B82B5d3',
      '0x3e111115A82dF6190e36ADf0d552880663A4dBF1',
      '0x3e11226fe3d85142B734ABCe6e58918d5828d1b4',
      '0x3e1133aC082716DDC3114bbEFEeD8B1731eA9cb1',
      '0x3e11444c7650234c748D743D8d374fcE2eE5E6C9',
    ]
  }
})
