import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import ADDRESSES from "../../helpers/coreAssets.json"

type ChainConfig = {
  start: string
  portal: string
  spokePool: string
}

const FUNDS_DEPOSITED = "event FundsDeposited(bytes32 inputToken,bytes32 outputToken,uint256 inputAmount,uint256 outputAmount,uint256 indexed destinationChainId,uint256 indexed depositId,uint32 quoteTimestamp,uint32 fillDeadline,uint32 exclusivityDeadline,bytes32 indexed depositor,bytes32 recipient,bytes32 exclusiveRelayer,bytes message)"

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ARBITRUM]: { start: "2026-02-10", portal: "0x025f28177dBc77A7134f76C0498467b3ea3aa2A2", spokePool: "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a" },
  [CHAIN.BASE]: { start: "2026-02-10", portal: "0xfe76Ad9679932acb2dbB3eD76283F03f7D80006e", spokePool: "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64" },
  [CHAIN.BLAST]: { start: "2026-02-10", portal: "0xDa69f96C1d2DF824a11354d423dc84106AAA411a", spokePool: "0x2d509190ed0172ba588407d4c2df918f955cc6e1" },
  [CHAIN.BSC]: { start: "2026-02-10", portal: "0xc3fBfe30fBD27774018f2D125FC195f799A375Bf", spokePool: "0x4e8e101924ede233c13e2d8622dc8aed2872d505" },
  [CHAIN.ETHEREUM]: { start: "2026-02-10", portal: "0x8a6a5990Dd8D8781D3c15Be2E8C36720C9A453D2", spokePool: "0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5" },
  [CHAIN.INK]: { start: "2026-02-10", portal: "0x92E8C76e9058BC0cb68a88eFAB9dB37c9A70Bb9e", spokePool: "0xef684c38f94f48775959ecf2012d7e864ffb9dd4" },
  [CHAIN.LINEA]: { start: "2026-02-10", portal: "0x7C085CB54F82F0dcf6Ac66057BB6125c6279a324", spokePool: "0x7e63a5f1a8f0b4d0934b2f2327daed3f6bb2ee75" },
  [CHAIN.LISK]: { start: "2026-02-10", portal: "0xDa69f96C1d2DF824a11354d423dc84106AAA411a", spokePool: "0x9552a0a6624a23b848060ae5901659cdda1f83f8" },
  [CHAIN.MODE]: { start: "2026-02-10", portal: "0xBafbbCe0c1a7e540291225724D35ba00d91370Ef", spokePool: "0x3bad7ad0728f9917d1bf08af5782dcbd516cdd96" },
  [CHAIN.MONAD]: { start: "2026-02-10", portal: "0x69f571C93D055CB8096d0D8F591F9e9293a83d31", spokePool: "0xd2ecb3afe598b746f8123cae365a598da831a449" },
  [CHAIN.OPTIMISM]: { start: "2026-02-10", portal: "0x514302FCbaC5a65E09fFD7d68cf4F9F490A000CE", spokePool: "0x6f26bf09b1c792e3228e5467807a900a503c0281" },
  [CHAIN.PLASMA]: { start: "2026-02-10", portal: "0xDa69f96C1d2DF824a11354d423dc84106AAA411a", spokePool: "0x50039faefebef707cfd94d6d462fe6d10b39207a" },
  [CHAIN.POLYGON]: { start: "2026-02-10", portal: "0xDc61B3Be0c2e9709589d0bb7086F28f962dfB959", spokePool: "0x9295ee1d8c5b022be115a2ad3c30c72e34e7f096" },
  [CHAIN.SCROLL]: { start: "2026-02-10", portal: "0xDa69f96C1d2DF824a11354d423dc84106AAA411a", spokePool: "0x3bad7ad0728f9917d1bf08af5782dcbd516cdd96" },
  [CHAIN.SONEIUM]: { start: "2026-02-10", portal: "0x32c674ACCCF7f98702b276361C2510b5Db349437", spokePool: "0x3bad7ad0728f9917d1bf08af5782dcbd516cdd96" },
  [CHAIN.UNICHAIN]: { start: "2026-02-10", portal: "0xAE65c7cA6897728cF6d5Fb38Cf6f8Fe53d74f0eE", spokePool: "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64" },
  [CHAIN.WC]: { start: "2026-02-10", portal: "0x049A2ADD1211Aa25F8e9BAeA5F69094ceB1e2A99", spokePool: "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64" },
  [CHAIN.ZORA]: { start: "2026-02-10", portal: "0x3216F0aaF5e0d30b6b4B4a79DA2f49e6db68d881", spokePool: "0x13fdac9f9b4777705db45291bbff3c972c6d1d97" },
}

const portals = new Set(Object.values(chainConfig).map(({ portal }) => portal.toLowerCase()))

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain]
  const dailyBridgeVolume = options.createBalances()
  const logs = await options.getLogs({ target: config.spokePool, eventAbi: FUNDS_DEPOSITED })

  logs.forEach((log) => {
    const recipient = `0x${log.recipient.slice(-40)}`.toLowerCase()
    if (!portals.has(recipient)) return

    const token = `0x${log.inputToken.slice(-40)}`
    if (token.toLowerCase() === ADDRESSES.GAS_TOKEN_2.toLowerCase()) dailyBridgeVolume.addGasToken(log.inputAmount)
    else dailyBridgeVolume.add(token, log.inputAmount)
  })

  return { dailyBridgeVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
}

export default adapter
