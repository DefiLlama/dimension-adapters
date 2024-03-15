import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const pools: string[] = [
  '0x1e0e812fbcd3eb75d8562ad6f310ed94d258d008',
  '0x63da4db6ef4e7c62168ab03982399f9588fcd198',
  '0x03b666f3488a7992b2385b12df7f35156d7b29cd',
  '0x20f8aefb5697b77e0bb835a8518be70775cda1b0',
  '0xbc8a244e8fb683ec1fd6f88f3cc6e565082174eb',
  '0x84b123875f0f36b966d0b6ca14b31121bd9676ad',
  '0x5eec60f348cb1d661e4a5122cf4638c7db7a886e',
  '0xd1654a7713617d41a8c9530fb9b948d00e162194',
  '0x61c9e05d1cdb1b70856c7a2c53fa9c220830633c',
  '0x48887ceea1b8ad328d5254bef774be91b90faa09',
  '0x044b6b0cd3bb13d2b9057781df4459c66781dce7',
  '0x5e74d85311fe2409c341ce49ce432bb950d221de'
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
