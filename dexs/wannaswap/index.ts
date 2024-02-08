import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";


const pools: string[] = [
'0xf56997948d4235514dcc50fc0ea7c0e110ec255d',
'0xbf9eef63139b67fd0abf22bd5504acb0519a4212',
'0x3502eac6fa27beebdc5cd3615b7cb0784b0ce48f',
'0x256d03607eee0156b8a2ab84da1d5b283219fe97',
'0xbf58062d23f869a90c6eb04b9655f0dfca345947',
'0xca461686c711aeaadf0b516f9c2ad9d9b645a940',
'0xbf560771b6002a58477efbcdd6774a5a1947587b',
'0x957b4bc289d29129680b2d6c6d06c9106a38bb82',
'0xddccf2f096fa400ce90ba0568908233e6a950961',
'0x2a6e6d58547d2580b490445cca0ce625c4f5d84a',
'0x523fae29d7ff6fd38842c8f271edf2ebd3150435',
'0xe22606659ec950e0328aa96c7f616adc4907cbe3',
'0x2e02bea8e9118f7d2ccada1d402286cc6d54bd67',
'0x7e9ea10e5984a09d19d05f31ca3cb65bb7df359d',
'0x10c0c000b9ef01ba07d7473729a19e85e89b6246',
'0xe6c47b036f6fd0684b109b484ac46094e633af2e'
].map((address: string) => address.toLowerCase());

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AURORA]: {
      fetch: getDexVolumeExports({ chain: CHAIN.AURORA, pools }),
      start: 1678838400,
    }
  }
}

export default adapters
