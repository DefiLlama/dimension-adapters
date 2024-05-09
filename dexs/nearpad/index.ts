import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const pools: string[] = [
  '0xc374776cf5c497adeef6b505588b00cb298531fd',
  '0x73155e476d6b857fe7722aefebad50f9f8bd0b38',
  '0x63b4a0538ce8d90876b201af1020d13308a8b253',
  '0xa188d79d6bdbc1120a662de9eb72384e238af104',
  '0x24886811d2d5e362ff69109aed0a6ee3eeeec00b',
  '0xfe28a27a95e51bb2604abd65375411a059371616',
  '0x1fd6cbbfc0363aa394bd77fc74f64009bf54a7e9',
  '0xb53bc2537e641c37c7b7a8d33aba1b30283cda2f',
  '0xaf3f197ce82bf524dab0e9563089d443cb950048',
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
