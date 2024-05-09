import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";


const pools: string[] = [
  '0xf3de9dc38f62608179c45fe8943a0ca34ba9cefc',
  '0xc57ecc341ae4df32442cf80f34f41dc1782fe067',
  '0x480a68ba97d70495e80e11e05d59f6c659749f27',
  '0xec538fafafcbb625c394c35b11252cef732368cd',
  '0xdb0363ee28a5b40bdc2f4701e399c63e00f91aa8',
  '0xefcf518ca36dc3362f539965807b42a77dc26be0',
  '0x5bdac608cd38c5c8738f5be20813194a3150d4ff',
  '0xcb8584360dc7a4eac4878b48fb857aa794e46fa8',
  '0x865c59d555e59c9f35487bbdfb22d617c67aeabd',
  '0xe11a3f2bab372d88d133b64487d1772847eec4ea',
  '0x23524a789f93b798a6e7011b276edf09083cfde6',
  '0x30c3d6c114a350026ea0aa770788374ad6c6f765'
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
