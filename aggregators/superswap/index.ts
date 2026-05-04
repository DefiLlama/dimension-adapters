import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import ADDRESSES from '../../helpers/coreAssets.json'

const event_route = 'event Route(address indexed from,address to,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOutMin,uint256 amountOut)'

const contracts: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ['0x50b1E6ab68E6BeD281C27810dEd0c293C3a20B4D'],
  [CHAIN.OPTIMISM]: ['0x5ECcD3f2eB245d20Db0e26934961576C1D1B0438'],
  [CHAIN.BSC]: ['0x51abC29C7b7611333Ba56cfe6B10dC1ff089786E'],
  [CHAIN.UNICHAIN]: ['0xB4f358117356E63761537316a4Fdbc0bFCFAA070'],
  [CHAIN.POLYGON]: ['0xb511c2CF878e950e5598C1c3e47e546930A1AEa5'],
  [CHAIN.ERA]: ['0xec598F086899eD1EE56F8666a31ed19e57453725'],
  [CHAIN.WC]: ['0x2b7279D1227CC4838e15f473b8e1718ACBEc4292'],
  [CHAIN.LISK]: ['0x756d003c2aacFBAB59C29aFC49933B952bd9E600'],
  [CHAIN.SONEIUM]: ['0x756d003c2aacFBAB59C29aFC49933B952bd9E600'],
  [CHAIN.BASE]: ['0x19FD96207f7B5c55403BE736897f7C1109C8314E'],
  [CHAIN.MODE]: ['0x919150CC162573d9BdCa1887E557b3208b536C99'],
  [CHAIN.ARBITRUM]: ['0x8b9Ffff3d567cc578752D455BCb7BE86fa60F5b8'],
  [CHAIN.INK]: [
    '0x5839389261D1F38aac7c8E91DcDa85646bEcB414',
    '0x9f64D99eA5BA69d2E6a5f19a923A26fbdfB370B9',
  ],
  [CHAIN.LINEA]: ['0x20b46e8b753093cFf78276832b92DE1A952dcF74'],
  [CHAIN.BLAST]: ['0x756d003c2aacFBAB59C29aFC49933B952bd9E600'],
  [CHAIN.SCROLL]: ['0x9326cA5FdDc0B6F758BE54Cfe0Ea39eDa56B1459'],
  [CHAIN.ZORA]: ['0x919150CC162573d9BdCa1887E557b3208b536C99'],
  [CHAIN.MONAD]: ['0xDa69f96C1d2DF824a11354d423dc84106AAA411a'],
  [CHAIN.MEGAETH]: ['0x3A735e9A60304A59EB4492A90D6d0C529631b50e'],
  [CHAIN.PLASMA]: ['0x2b7279D1227CC4838e15f473b8e1718ACBEc4292'],
  [CHAIN.HYPERLIQUID]: ['0x2b7279D1227CC4838e15f473b8e1718ACBEc4292'],
}

const addAmount = (dailyVolume: ReturnType<FetchOptions['createBalances']>, token: string, amount: string) => {
  if (token.toLowerCase() === ADDRESSES.GAS_TOKEN_2.toLowerCase()) {
    dailyVolume.addGasToken(amount)
  } else {
    dailyVolume.add(token, amount)
  }
}

const fetchVolume = async (options: FetchOptions) => {
  const targets = contracts[options.chain]
  if (!targets?.length) {
    throw new Error(`No contracts configured for chain: ${options.chain}`)
  }
  const logs = await options.getLogs({
    targets,
    eventAbi: event_route,
  })
  const dailyVolume = options.createBalances()
  logs.forEach(log => {
    addAmount(dailyVolume, log.tokenIn, log.amountIn)
  })
  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchVolume,
  methodology: {
    dailyVolume: "Volume is calculated by summing the amountIn values from Route events emitted by SuperSwap router contracts across all supported chains."
  },
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2026-02-10' },
    [CHAIN.OPTIMISM]: { start: '2026-02-10' },
    [CHAIN.BSC]: { start: '2026-02-10' },
    [CHAIN.UNICHAIN]: { start: '2026-02-10' },
    [CHAIN.POLYGON]: { start: '2026-02-10' },
    [CHAIN.ERA]: { start: '2026-02-10' },
    [CHAIN.WC]: { start: '2026-02-10' },
    [CHAIN.LISK]: { start: '2026-02-10' },
    [CHAIN.SONEIUM]: { start: '2026-02-10' },
    [CHAIN.BASE]: { start: '2026-02-10' },
    [CHAIN.MODE]: { start: '2026-02-10' },
    [CHAIN.ARBITRUM]: { start: '2026-02-10' },
    [CHAIN.INK]: { start: '2026-02-10' },
    [CHAIN.LINEA]: { start: '2026-02-10' },
    [CHAIN.BLAST]: { start: '2026-02-10' },
    [CHAIN.SCROLL]: { start: '2026-02-10' },
    [CHAIN.ZORA]: { start: '2026-02-10' },
    [CHAIN.MONAD]: { start: '2026-02-10' },
    [CHAIN.MEGAETH]: { start: '2026-02-10' },
    [CHAIN.PLASMA]: { start: '2026-02-10' },
    [CHAIN.HYPERLIQUID]: { start: '2026-02-10' },
  },
}

export default adapter;
