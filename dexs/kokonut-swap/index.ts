import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const pools = [
  {
    address: '0x3a15884903a7D4eF82905a608431E677f6E33306',
    symbol: 'KLAY-AKLAY',
    poolType: 'BASE_POOL',
    coins: [
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      '0x74BA03198FEd2b15a51AF242b9c63Faf3C8f4D34'
    ],
  },
  {
    address: '0x7a5987c8c48F6C82632aCEF383E5fb5DB23C0027',
    symbol: 'KLAY-KSD',
    poolType: 'CRYPTO_POOL',
    coins: [
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      '0x4Fa62F1f404188CE860c8f0041d6Ac3765a72E67'
    ],
  },
  {
    address: '0xb0Da0BBE0a13C2c17178aEa2fEC91AA08157F299',
    symbol: '4NUTS',
    poolType: 'BASE_POOL',
    coins: [
      '0x4Fa62F1f404188CE860c8f0041d6Ac3765a72E67',
      '0x5c74070FDeA071359b86082bd9f9b3dEaafbe32b',
      '0x754288077D0fF82AF7a5317C7CB8c444D421d103',
      '0xceE8FAF64bB97a73bb51E115Aa89C17FfA8dD167'
    ],
  },
  {
    address: '0xea08370B52AEcB09D976f37AB3954F0E82BaeE05',
    symbol: 'KOKOS-KSD',
    poolType: 'CRYPTO_POOL',
    coins: [
      '0xCd670d77f3dCAB82d43DFf9BD2C4b87339FB3560',
      '0x4Fa62F1f404188CE860c8f0041d6Ac3765a72E67'
    ],
  }
]

const swapEvent = "event TokenExchange(address indexed buyer, uint256 soldId, uint256 tokensSold, uint256 boughtId, uint256 tokensBought, uint256 fee)"

const KLAY = '0x19aac5f612f524b754ca7e7c41cbfa2e981a4432' // WKLAY used for pricing 0xEeee...

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  for (const pool of pools) {
    const logs = await options.getLogs({ target: pool.address, eventAbi: swapEvent })
    for (const log of logs) {
      const boughtId = Number(log.boughtId)
      const tokensBought = log.tokensBought
      const fee = log.fee
      let token = pool.coins[boughtId]
      if (token.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') token = KLAY
      dailyVolume.add(token, tokensBought)
    }
  }

  return { dailyVolume }
};

const adapter: SimpleAdapter = {
  version:2,
  pullHourly: true,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: '2022-12-30',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: () => { throw new Error("No volume data available for polygon zkEVM") },
      start: '2023-06-19',
      deadFrom: "2025-03-21",
    },
    [CHAIN.BASE]: {
      fetch: () => { throw new Error("No volume data available for base") },
      start: '2023-08-09',
      deadFrom: "2025-03-21",
    },
  },
};

export default adapter;
