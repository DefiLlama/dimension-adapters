import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSaddleVolume } from "../../helpers/saddle";


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CELO]: {
      fetch,
      start: '2021-11-10',
    },
  },
};

export default adapter;
const pools = [
  "0xc0ba93d4aaf90d39924402162ee4a213300d1d60",
  "0xebf0536356256f8ff2a5eb6c65800839801d8b95",
  "0x9f4adbd0af281c69a582eb2e6fa2a594d4204cae",
  "0x74ef28d635c6c5800dd3cd62d4c4f8752daacb09",
  "0x9906589ea8fd27504974b7e8201df5bbde986b03",
  "0xf3f65dfe0c8c8f2986da0fec159abe6fd4e700b4",
  "0xaefc4e8cf655a182e8346b24c8abce45616ee0d2",
  "0xcce0d62ce14fb3e4363eb92db37ff3630836c252",
  "0xa5037661989789d0310ac2b796fa78f1b01f195d",
  "0x0986b42f5f9c42feeef66fc23eba9ea1164c916d",
  "0xa2f0e57d4ceacf025e81c76f28b9ad6e9fbe8735",
  "0xfc9e2c63370d8deb3521922a7b2b60f4cff7e75a",
  "0x23c95678862a229fac088bd9705622d78130bc3e",
  "0x02db089fb09fda92e05e92afcd41d9aafe9c7c7c",
  "0x63c1914bf00a9b395a2bf89aada55a5615a3656e",
  "0x2080aaa167e2225e1fc9923250ba60e19a180fb2",
  "0x19260b9b573569ddb105780176547875fe9feda3",
  "0xe0f2cc70e52f05edb383313393d88df2937da55a",
  "0xdbf27fd2a702cc02ac7acf0aea376db780d53247",
  "0x0ff04189ef135b6541e56f7c638489de92e9c778",
  "0x413ffcc28e6cdde7e93625ef4742810fe9738578",
  "0x382ed834c6b7dbd10e4798b08889eaed1455e820",
  "0x81b6a3d9f725ab5d706d9e552b128bc5bb0b58a1",
  "0xfa3df877f98ac5ecd87456a7accaa948462412f0",
]

async function fetch(options: FetchOptions) {
  return getSaddleVolume(options, pools)
}
