import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// Volume is read from on-chain swap events. The DODO gateway dashboard
// (gateway.dodoex.io FetchDashboardDailyData) used before publishes days late and
// partially (ethereum/bsc/arbitrum missing together on some days, every chain zero
// on others, linea/scroll zero for months) and never revises the gaps.

// Factory addresses: https://api.dodoex.io/dodo-contract/list
// Factories marked "older" are not in that list; they are indexed by DODO's own subgraph
// (https://github.com/DODOEX/dodoex_v2_subgraph, subgraphs/dodoex/*.yaml) and share the
// listed factories' CloneFactory / DODO multisig owner. fromBlock = first pool creation.
const NEW_POOL_EVENTS = {
  DVM: 'event NewDVM(address baseToken, address quoteToken, address creator, address pool)',
  DPP: 'event NewDPP(address baseToken, address quoteToken, address creator, address pool)',
  DSP: 'event NewDSP(address baseToken, address quoteToken, address creator, address pool)',
  GSP: 'event NewGSP(address baseToken, address quoteToken, address creator, address pool)',
}

// V2 pools (DVM, DPP, DSP, GSP) all emit DODOSwap
const DODO_SWAP = 'event DODOSwap(address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address trader, address receiver)'

// V1 pairs are registered by DODOZoo and emit their own events
const DODO_BIRTH = 'event DODOBirth(address newBorn, address baseToken, address quoteToken)'
const SELL_BASE = 'event SellBaseToken(address indexed seller, uint256 payBase, uint256 receiveQuote)'
const BUY_BASE = 'event BuyBaseToken(address indexed buyer, uint256 receiveBase, uint256 payQuote)'

type Factory = { address: string, type: keyof typeof NEW_POOL_EVENTS, fromBlock: number }
type ChainConfig = { start: string, factories: Factory[], zoo?: { address: string, fromBlock: number } }

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: '2020-08-08',
    zoo: { address: '0x3A97247DF274a17C59A3bd12735ea3FcDFb49950', fromBlock: 10616399 },
    factories: [
      { address: '0x72d220cE168C4f361dD4deE5D826a01AD8598f6C', type: 'DVM', fromBlock: 11718232 },
      { address: '0x5336edE8F971339F6c0e304c66ba16F1296A2Fbe', type: 'DPP', fromBlock: 13435939 },
      { address: '0x6b4fa0bc61eddc928e0df9c7f01e407bfcd3e5ef', type: 'DPP', fromBlock: 11927758 }, // older
      { address: '0xb5dc5e183c2acf02ab879a8569ab4edaf147d537', type: 'DPP', fromBlock: 11717411 }, // older
      { address: '0x6fdDB76c93299D985f4d3FC7ac468F9A168577A4', type: 'DSP', fromBlock: 12430370 },
      { address: '0x710409D2121b7C8ea4aCADD6803fDe2D85DF6473', type: 'GSP', fromBlock: 20779592 }, // older: not in the contract list
    ],
  },
  [CHAIN.BSC]: {
    start: '2020-09-23',
    zoo: { address: '0xCA459456a45e300AA7EF447DBB60F87CCcb42828', fromBlock: 727280 },
    factories: [
      { address: '0x790B4A80Fb1094589A3c0eFC8740aA9b0C1733fB', type: 'DVM', fromBlock: 5072675 },
      { address: '0xf50bdc9e90b7a1c138cb7935071b85c417c4cb8e', type: 'DVM', fromBlock: 4331487 }, // older
      { address: '0x7737fd30535c69545deeea54ab8dd590ccaebd3c', type: 'DPP', fromBlock: 4327456 }, // older
      { address: '0xd9CAc3D964327e47399aebd8e1e6dCC4c251DaAE', type: 'DPP', fromBlock: 11790801 },
      { address: '0xAfe0A75DFFb395eaaBd0a7E1BBbd0b11f8609eeF', type: 'DPP', fromBlock: 5098218 }, // older
      { address: '0x9B64c81ba54eA51e1f6B7fefb3cfF8AA6F1e2A09', type: 'DPP', fromBlock: 4561565 }, // older
      { address: '0x0fb9815938Ad069Bf90E14FE6C596c514BEDe767', type: 'DSP', fromBlock: 6731305 },
      { address: '0x78D43a889F42a344FE98C3Fb9455791Dc8178D55', type: 'GSP', fromBlock: 42126003 }, // older
    ],
  },
  [CHAIN.POLYGON]: {
    start: '2021-05-18',
    zoo: { address: '0x357c5E9cfA8B834EDcef7C7aAbD8F9Db09119d11', fromBlock: 14724550 },
    factories: [
      { address: '0x79887f65f83bdf15Bcc8736b5e5BcDB48fb8fE13', type: 'DVM', fromBlock: 14722979 },
      { address: '0xd24153244066F0afA9415563bFC7Ba248bfB7a51', type: 'DPP', fromBlock: 20239046 },
      { address: '0x95E887aDF9EAa22cC1c6E3Cb7f07adC95b4b25a8', type: 'DPP', fromBlock: 14641985 }, // older
      { address: '0x43C49f8DD240e1545F147211Ec9f917376Ac1e87', type: 'DSP', fromBlock: 15555786 },
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: '2021-06-10',
    zoo: { address: '0xBcC3401E16C25EaF4d3FeD632ce3288503883B1f', fromBlock: 226940 },
    factories: [
      { address: '0xDa4c4411c55B0785e501332354A036c04833B72b', type: 'DVM', fromBlock: 227017 },
      { address: '0xb0C7cB15b52b0093130487209e96CFeC0Ba4Ff66', type: 'DVM', fromBlock: 1246 }, // older
      { address: '0xa6Cf3d163358aF376ec5e8B7Cc5e102a05FdE63D', type: 'DPP', fromBlock: 2241891 },
      { address: '0xddb13e6dd168e1a68dc2285cb212078ae10394a9', type: 'DPP', fromBlock: 390693 }, // older
      { address: '0xC8fE2440744dcd733246a4dB14093664DEFD5A53', type: 'DSP', fromBlock: 797972 },
      { address: '0x46E55A974C5995675b025F7F607C3278B36f0c29', type: 'GSP', fromBlock: 252253566 }, // older
    ],
  },
  [CHAIN.AVAX]: {
    start: '2021-12-29',
    factories: [
      { address: '0xfF133A6D335b50bDAa6612D19E1352B049A8aE6a', type: 'DVM', fromBlock: 8850831 },
      { address: '0xb7865a5ceE051d35B09A48b624D7057d3362655a', type: 'DPP', fromBlock: 12157178 },
      { address: '0x2b0d94Eb7A63B8a2909dE1CB3951ecF7Ae76D2fE', type: 'DSP', fromBlock: 10803054 },
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: '2022-04-24',
    factories: [
      { address: '0x2B800DC6270726F7E2266cE8cD5A3F8436fe0B40', type: 'DVM', fromBlock: 6358664 },
      { address: '0xDb9C53F2cED34875685B607c97A61a65DA2F30a8', type: 'DPP', fromBlock: 6339341 },
      { address: '0x1f83858cD6d0ae7a08aB1FD977C06DABEcE6d711', type: 'DSP', fromBlock: 6339193 },
    ],
  },
  [CHAIN.BASE]: {
    start: '2023-08-04',
    factories: [
      { address: '0x0226fCE8c969604C3A0AD19c37d1FAFac73e13c2', type: 'DVM', fromBlock: 2162620 },
      { address: '0xc0F9553Df63De5a97Fe64422c8578D0657C360f7', type: 'DPP', fromBlock: 2644987 },
      { address: '0x200D866Edf41070DE251Ef92715a6Ea825A5Eb80', type: 'DSP', fromBlock: 2779534 },
    ],
  },
  [CHAIN.LINEA]: {
    start: '2023-08-18',
    factories: [
      { address: '0xc0F9553Df63De5a97Fe64422c8578D0657C360f7', type: 'DVM', fromBlock: 222765 },
      { address: '0x97bBF5BB1dcfC93A8c67e97E50Bea19DB3416A83', type: 'DPP', fromBlock: 452530 },
      { address: '0x2933c0374089D7D98BA0C71c5E02E1A0e09deBEE', type: 'DSP', fromBlock: 1043478 },
    ],
  },
  [CHAIN.SCROLL]: {
    start: '2023-10-23',
    factories: [
      { address: '0x5a0C840a7089aa222c4458b3BE0947fe5a5006DE', type: 'DVM', fromBlock: 231989 },
      { address: '0x31AC053c31a77055b2ae2d3899091C0A9c19cE3a', type: 'DPP', fromBlock: 347409 },
      { address: '0x7E9c460d0A10bd0605B15F0d0388e307d34a62E6', type: 'DSP', fromBlock: 407725 },
    ],
  },
}

const fetch = async (options: FetchOptions) => {
  const { factories, zoo } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()

  const toBlock = await options.getToBlock()
  const pools = new Set<string>()
  for (const { address, type, fromBlock } of factories) {
    if (fromBlock > toBlock) continue // factory not deployed yet in this window
    const logs = await options.getLogs({ target: address, eventAbi: NEW_POOL_EVENTS[type], fromBlock, cacheInCloud: true })
    logs.forEach((log: any) => pools.add(log.pool.toLowerCase()))
  }

  // tens of thousands of V2 pools: pull the event by topic and keep only DODO's own pools
  const swapLogs = await options.getLogs({ eventAbi: DODO_SWAP, noTarget: true, entireLog: true, parseLog: true })
  for (const log of swapLogs) {
    if (!pools.has((log.address ?? log.source).toLowerCase())) continue
    const { fromToken, toToken, fromAmount, toAmount } = log.parsedLog.args
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: fromToken, amount0: fromAmount, token1: toToken, amount1: toAmount })
  }

  if (zoo && zoo.fromBlock <= toBlock) {
    const pairs = await options.getLogs({ target: zoo.address, eventAbi: DODO_BIRTH, fromBlock: zoo.fromBlock, cacheInCloud: true })
    const targets = pairs.map((pair: any) => pair.newBorn)
    if (!targets.length) return { dailyVolume } // the zoo has not registered a V1 pair yet
    const [sells, buys] = await Promise.all([
      options.getLogs({ targets, eventAbi: SELL_BASE, flatten: false }),
      options.getLogs({ targets, eventAbi: BUY_BASE, flatten: false }),
    ])
    pairs.forEach(({ baseToken, quoteToken }: any, i: number) => {
      sells[i].forEach((log: any) => addOneToken({ chain: options.chain, balances: dailyVolume, token0: baseToken, amount0: log.payBase, token1: quoteToken, amount1: log.receiveQuote }))
      buys[i].forEach((log: any) => addOneToken({ chain: options.chain, balances: dailyVolume, token0: quoteToken, amount0: log.payQuote, token1: baseToken, amount1: log.receiveBase }))
    })
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Value of tokens swapped through DODO V1 pairs and V2 pools (DVM, DPP, DSP and GSP) created by DODO factories, counted on one side of each swap.',
  },
};

export default adapter
