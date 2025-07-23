import ADDRESSES from '../../helpers/coreAssets.json'
import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";

type TContracts = {
  [key in Chain]: string[][];
};
const contracts: TContracts = {
  [CHAIN.POLYGON]: [
    ['0x89cf9a71d45c58673a7f8b4c829df466da7a473a', ADDRESSES.polygon.WETH_1],
    ['0xa40986ccd9dc00c533ba71c9362529c9694f9f7b', ADDRESSES.polygon.USDC],
    ['0xf479405a2518b02a79c060f3d91fe0c98cfe6e25', ADDRESSES.polygon.USDC],
    ['0x64b8b618cddc31c61305338c6ab7a2d85a7ab5ca', ADDRESSES.polygon.USDC],
    ['0x19759660e5ee693df6105fc3629d5d91cb0a9447', ADDRESSES.polygon.WMATIC_2],
    ['0xbda26f37656218b2b3983800bc5734998445cc92', ADDRESSES.polygon.USDC],
    ['0x4b6e851015581e88824f1efd71cb65dd9826189b', ADDRESSES.polygon.USDC],
    ['0x4baa9f1af8653a875d51324ca563d12d7925adf5', ADDRESSES.polygon.USDC],
    ['0x8c7822f283137e1e73ea0bdc537ccfb2fa1fb030', ADDRESSES.polygon.USDC],
    ['0x13f7f23db676431a2371d0f1884ae1526a0fe5c2', ADDRESSES.polygon.WMATIC_2],
    ['0xb09d2ec9afff13589ddfab190e2d1aba7e02095b', ADDRESSES.polygon.WMATIC_2],
    ['0x6909bfbe79f9c33589c637eed166a32afea76ef6', ADDRESSES.polygon.USDC],
    ['0xf51dcd52bd075c91632aac42c3926b2a523b3da5', ADDRESSES.polygon.WMATIC_2],
    ['0x9ceeb2a6f17d3c7bd086471095fcf80cfe780149', ADDRESSES.polygon.WETH_1],
  ]
}

function twosComplementHexToDecimal(hexValue: string): number {
  // Check if the hex value starts with '0xf'
  if (!hexValue.startsWith('0xf')) {
    return Number(hexValue);
  }

  // Convert hex to binary
  const binaryValue = BigInt(hexValue).toString(2);

  // Apply two's complement
  const flippedBinary = binaryValue
    .split('')
    .map(bit => (bit === '0' ? '1' : '0'))
    .join('');
  const twoComplementBinary = (BigInt(`0b${flippedBinary}`) + BigInt(1)).toString(2);

  // Convert binary to decimal
  const decimalValue = parseInt(twoComplementBinary, 2);

  return decimalValue;
}

const topic0_trade = '0xeef2964c19d154a021c80f1901318bed137c1214368f991d6a118e9c64c5d9f6';

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, api }: FetchOptions) => {
    const dailyVolume = createBalances()
    const tokens = contracts[chain].map(i => i[1]);
    const decimals = await api.multiCall({  abi: 'erc20:decimals', calls: tokens})

    const logs = await getLogs({
      targets: contracts[chain].map(i => i[0]),
      topics: [topic0_trade],
      flatten: false,
      skipCacheRead: true,
    })
    logs.forEach((_logs, index) => {
      const token = tokens[index]
      const powDivider =  18 - +decimals[index]

      _logs.forEach((log) => {
        const data = log.data.replace('0x', '');
        const price = Number('0x' + data.slice(0, 64)) / 10 ** 18;
        const amount = twosComplementHexToDecimal('0x' + data.slice(64, 128)) / (10 ** powDivider)
        dailyVolume.add(token, amount * price);
      })
    })

    return { dailyVolume, timestamp }
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchVolume(CHAIN.POLYGON),
      start: '2022-09-08'
    }
  }
}
export default adapters;
