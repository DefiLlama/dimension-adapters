import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import ADDRESSES from '../../helpers/coreAssets.json'

const event_route = 'event Route(address indexed from,address to,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOutMin,uint256 amountOut)'

type ChainConfig = {
  start: string
  v1Routers: string[]
  v2Routers: string[]
  portal: string
}

const FEES = {
  inchain: 0.25, //0.25%
  crosschain: 0.35, //0.35%
}
const SWAP_FEES = 'Swap Fees'
const SWAP_FEES_TO_PROTOCOL = 'Swap Fees To Protocol'

// V1 routers are included for volume only. V2 routers use the same Route event and are the only routers with inferred fees.
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ARBITRUM]: { start: '2026-02-10', v1Routers: ['0x8b9Ffff3d567cc578752D455BCb7BE86fa60F5b8'], v2Routers: ['0x5E0DD34FB6C74552A1FFF089090375A508c1ead3'], portal: '0x025f28177dBc77A7134f76C0498467b3ea3aa2A2' },
  [CHAIN.BASE]: { start: '2026-02-10', v1Routers: ['0x19FD96207f7B5c55403BE736897f7C1109C8314E'], v2Routers: ['0xCb26DE359b51BDd87b8D054F260307b5EEfc0212'], portal: '0xfe76Ad9679932acb2dbB3eD76283F03f7D80006e' },
  [CHAIN.BLAST]: { start: '2026-02-10', v1Routers: ['0x756d003c2aacFBAB59C29aFC49933B952bd9E600'], v2Routers: ['0xBafbbCe0c1a7e540291225724D35ba00d91370Ef'], portal: '0xDa69f96C1d2DF824a11354d423dc84106AAA411a' },
  [CHAIN.BSC]: { start: '2026-02-10', v1Routers: ['0x51abC29C7b7611333Ba56cfe6B10dC1ff089786E'], v2Routers: ['0xFa227a80e8358c9794D425E87Fb81F828Eb9A052'], portal: '0xc3fBfe30fBD27774018f2D125FC195f799A375Bf' },
  [CHAIN.ETHEREUM]: { start: '2026-02-10', v1Routers: ['0x50b1E6ab68E6BeD281C27810dEd0c293C3a20B4D'], v2Routers: ['0x660e5bd52C1Be2b078eC886Ea2463C9b2ba5feB8'], portal: '0x8a6a5990Dd8D8781D3c15Be2E8C36720C9A453D2' },
  [CHAIN.INK]: { start: '2026-02-10', v1Routers: ['0x5839389261D1F38aac7c8E91DcDa85646bEcB414', '0x9f64D99eA5BA69d2E6a5f19a923A26fbdfB370B9'], v2Routers: ['0x8d3cAe434bA71F195400672A9F4b8838C6A96712'], portal: '0x92E8C76e9058BC0cb68a88eFAB9dB37c9A70Bb9e' },
  [CHAIN.LINEA]: { start: '2026-02-10', v1Routers: ['0x20b46e8b753093cFf78276832b92DE1A952dcF74'], v2Routers: ['0x7bf555d749895b6f5d70506AD6D62b6E1Cfb8015'], portal: '0x7C085CB54F82F0dcf6Ac66057BB6125c6279a324' },
  [CHAIN.LISK]: { start: '2026-02-10', v1Routers: ['0x756d003c2aacFBAB59C29aFC49933B952bd9E600'], v2Routers: ['0xBafbbCe0c1a7e540291225724D35ba00d91370Ef'], portal: '0xDa69f96C1d2DF824a11354d423dc84106AAA411a' },
  [CHAIN.MODE]: { start: '2026-02-10', v1Routers: ['0x919150CC162573d9BdCa1887E557b3208b536C99'], v2Routers: ['0x3216F0aaF5e0d30b6b4B4a79DA2f49e6db68d881'], portal: '0xBafbbCe0c1a7e540291225724D35ba00d91370Ef' },
  [CHAIN.MONAD]: { start: '2026-02-10', v1Routers: ['0xDa69f96C1d2DF824a11354d423dc84106AAA411a'], v2Routers: ['0xdFE1Fc6738ef169eA175c665A060b4a268B84724'], portal: '0x69f571C93D055CB8096d0D8F591F9e9293a83d31' },
  [CHAIN.OPTIMISM]: { start: '2026-02-10', v1Routers: ['0x5ECcD3f2eB245d20Db0e26934961576C1D1B0438'], v2Routers: ['0xa49bea83Fc71Cc430Bf95d51039E2464d5A1814a'], portal: '0x514302FCbaC5a65E09fFD7d68cf4F9F490A000CE' },
  [CHAIN.PLASMA]: { start: '2026-02-10', v1Routers: ['0x2b7279D1227CC4838e15f473b8e1718ACBEc4292'], v2Routers: ['0xBafbbCe0c1a7e540291225724D35ba00d91370Ef'], portal: '0xDa69f96C1d2DF824a11354d423dc84106AAA411a' },
  [CHAIN.POLYGON]: { start: '2026-02-10', v1Routers: ['0xb511c2CF878e950e5598C1c3e47e546930A1AEa5'], v2Routers: ['0xD001Cec33Ff94B1d41437d9c458c14242787cB24'], portal: '0xDc61B3Be0c2e9709589d0bb7086F28f962dfB959' },
  [CHAIN.REDSTONE]: { start: '2026-02-10', v1Routers: [], v2Routers: ['0x9dF7c388b90f79855D523E4fd03633Fc6BAB5378'], portal: '0x248B7A18b3E9C4D61fD41B475575DADcaE2BbC29' },
  [CHAIN.SCROLL]: { start: '2026-02-10', v1Routers: ['0x9326cA5FdDc0B6F758BE54Cfe0Ea39eDa56B1459'], v2Routers: ['0xBafbbCe0c1a7e540291225724D35ba00d91370Ef'], portal: '0xDa69f96C1d2DF824a11354d423dc84106AAA411a' },
  [CHAIN.SONEIUM]: { start: '2026-02-10', v1Routers: ['0x756d003c2aacFBAB59C29aFC49933B952bd9E600'], v2Routers: ['0xDa69f96C1d2DF824a11354d423dc84106AAA411a'], portal: '0x32c674ACCCF7f98702b276361C2510b5Db349437' },
  [CHAIN.UNICHAIN]: { start: '2026-02-10', v1Routers: ['0xB4f358117356E63761537316a4Fdbc0bFCFAA070'], v2Routers: ['0xC4fd90f2f2B1D12256A0459C888Ecd1d4d0f9A87'], portal: '0xAE65c7cA6897728cF6d5Fb38Cf6f8Fe53d74f0eE' },
  [CHAIN.WC]: { start: '2026-02-10', v1Routers: ['0x2b7279D1227CC4838e15f473b8e1718ACBEc4292'], v2Routers: ['0x248B7A18b3E9C4D61fD41B475575DADcaE2BbC29'], portal: '0x049A2ADD1211Aa25F8e9BAeA5F69094ceB1e2A99' },
  [CHAIN.ZORA]: { start: '2026-02-10', v1Routers: ['0x919150CC162573d9BdCa1887E557b3208b536C99'], v2Routers: ['0xb3eD19a22b6e1Ee92166a0d6BD7033037A32803E'], portal: '0x3216F0aaF5e0d30b6b4B4a79DA2f49e6db68d881' },
  [CHAIN.ERA]: { start: '2026-02-10', v1Routers: ['0xec598F086899eD1EE56F8666a31ed19e57453725'], v2Routers: [], portal: '' },
  [CHAIN.MEGAETH]: { start: '2026-02-10', v1Routers: ['0x3A735e9A60304A59EB4492A90D6d0C529631b50e'], v2Routers: [], portal: '' },
  [CHAIN.HYPERLIQUID]: { start: '2026-02-10', v1Routers: ['0x2b7279D1227CC4838e15f473b8e1718ACBEc4292'], v2Routers: [], portal: '' },
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain]
  const v1Logs = config.v1Routers.length ? await options.getLogs({ targets: config.v1Routers, eventAbi: event_route }) : []
  const v2Logs = config.v2Routers.length ? await options.getLogs({ targets: config.v2Routers, eventAbi: event_route }) : []
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const portal = config.portal.toLowerCase()

  ;[...v1Logs, ...v2Logs].forEach(log => {
    if (log.tokenIn.toLowerCase() === ADDRESSES.GAS_TOKEN_2.toLowerCase()) dailyVolume.addGasToken(log.amountIn)
    else dailyVolume.add(log.tokenIn, log.amountIn)
  })

  v2Logs.forEach(log => {
    const fee = log.from.toLowerCase() === portal || log.to.toLowerCase() === portal ? FEES.crosschain : FEES.inchain
    const feeAmount = (BigInt(log.amountIn) * BigInt(fee * 100)) / 10_000n
    if (feeAmount === 0n) return
    const amount = feeAmount.toString()

    if (log.tokenIn.toLowerCase() === ADDRESSES.GAS_TOKEN_2.toLowerCase()) {
      dailyFees.addGasToken(amount, SWAP_FEES)
      dailyUserFees.addGasToken(amount, SWAP_FEES)
      dailyRevenue.addGasToken(amount, SWAP_FEES_TO_PROTOCOL)
      dailyProtocolRevenue.addGasToken(amount, SWAP_FEES_TO_PROTOCOL)
    } else {
      dailyFees.add(log.tokenIn, amount, SWAP_FEES)
      dailyUserFees.add(log.tokenIn, amount, SWAP_FEES)
      dailyRevenue.add(log.tokenIn, amount, SWAP_FEES_TO_PROTOCOL)
      dailyProtocolRevenue.add(log.tokenIn, amount, SWAP_FEES_TO_PROTOCOL)
    }
  })

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Volume: "Sum of amountIn from Route events on SuperSwap v1 and v2 routers.",
  Fees: "V2 swaps charge 0.25% for in-chain swaps and 0.35% for cross-chain portal swaps.",
  UserFees: "V2 swaps charge 0.25% for in-chain swaps and 0.35% for cross-chain portal swaps.",
  Revenue: "All fees are retained by SuperSwap.",
  ProtocolRevenue: "All fees are retained by SuperSwap.",
}

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Swap fees charged on v2 SuperSwap routes: 0.25% for in-chain swaps and 0.35% for cross-chain portal swaps.",
  },
  UserFees: {
    [SWAP_FEES]: "Fees paid by users on v2 SuperSwap routes.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Swap fees retained by SuperSwap.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Swap fees retained by SuperSwap.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig,
}

export default adapter;
