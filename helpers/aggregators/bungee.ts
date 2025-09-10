import ADDRESSES from '../coreAssets.json'
import BigNumber from "bignumber.js";
import { FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as ethers from "ethers";

const SocketGatewayAbis = {
  SocketBridge: 'event SocketBridge(uint256 amount, address token, uint256 toChainId, bytes32 bridgeName, address sender, address receiver, bytes32 metadata)',
  SocketSwapTokens: 'event SocketSwapTokens(address fromToken, address toToken, uint256 buyAmount, uint256 sellAmount, bytes32 routeName, address receiver, bytes32 metadata)',
  SocketFeesDeducted: 'event SocketFeesDeducted (uint256 fees, address feesTaker, address feesToken)',
}

export const SocketGatewayContracts: {[key: string]: string} = {
  [CHAIN.ETHEREUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.AURORA]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.ARBITRUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.OPTIMISM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BASE]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BLAST]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.AVAX]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BSC]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.POLYGON]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.POLYGON_ZKEVM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.FANTOM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.LINEA]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.MANTLE]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.SCROLL]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.ERA]: '0xadde7028e7ec226777e5dea5d53f6457c21ec7d6',
  [CHAIN.XDAI]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.MODE]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
}

const BungeeGatewayAbis = {
  RequestExtracted: 'event RequestExtracted(bytes32 indexed requestHash, uint8 implId, address transmitter, bytes execution)',
  RequestFulfilled: 'event RequestFulfilled(bytes32 indexed requestHash, uint8 implId, address fulfiller, bytes execution)',
}

export const BungeeGatewayContracts: {[key: string]: {
  audited: Array<string>;
  unaudited: Array<string>;
}} = {
  [CHAIN.ETHEREUM]: {
    audited: [],
    unaudited: ['0xe772551F88E2c14aEcC880dF6b7CBd574561bf82'],
  },
  [CHAIN.OPTIMISM]: {
    audited: ['0x09DAbdD517Ff1e155DeDEF64EC629Ca0285a31af'],
    unaudited: ['0x9c366293ba7e893cE184d75794330d674E4D17c2']
  },
  [CHAIN.BASE]: {
    audited: ['0x84F06fBaCc4b64CA2f72a4B26191DAD97f2b52BA'],
    unaudited: ['0x01710cdb7319292ed50a3f92561a599f5c650e2c'],
  },
  [CHAIN.ARBITRUM]: {
    audited: ['0xCdEa28Ee7BD5bf7710B294d9391e1b6A318d809a'],
    unaudited: ['0x8d00ad02df0c7b0c379bc1cb49fd74aa10698bfc'],
  },
  [CHAIN.BSC]: {
    audited: ['0x9aF2b913679049c966b77934af4CbE7Bb36Cf9D3'],
    unaudited: ['0x6a138b12be537e3b47328d627c1699bfaaaa68ce'],
  },
  [CHAIN.POLYGON]: {
    audited: ['0x6DDe7CF4e6A6f53F058Bf5d2B4a54aFBba11EE54'],
    unaudited: ['0x652e1b759516fe79b2b63753f1c7b3c44faa3df8'],
  },
  [CHAIN.XDAI]: {
    audited: [
      '0x5e01dbBBe59F8987673FAdD1469DdD2Be71e00af',
      '0x5e01dbBBe59F8987673FAdD1469DdD2Be71e00af',
    ],
    unaudited: ['0x8f503B6d9fFdae8d375d1E226b71B4B3144D3849'],
  },
  [CHAIN.LINEA]: {
    audited: ['0x6b1a31Af8A9DC9E8e489035859ca98D6335a0bcB'],
    unaudited: ['0x79C7a69499Cf1866734E8D3154200a05aE41c865'],
  },
  [CHAIN.MANTLE]: {
    audited: ['0x69f9d5a9E04b9cED4dff07Cd47c393856FA3D6Be'],
    unaudited: ['0x8f503B6d9fFdae8d375d1E226b71B4B3144D3849'],
  },
  [CHAIN.SONIC]: {
    audited: ['0x11918f1cb6db5e008A692F47c5320216fba6054B'],
    unaudited: ['0xD26410401cC61a24205A01CC620A73c010FBA290'],
  },
  [CHAIN.AVAX]: {
    audited: ['0xfe191a43dc4F3d57d7D942717D259005967e4e0D'],
    unaudited: ['0xD59ac324AAfE6A27c0713b54bf46B1Db9C3b72FE'],
  },
  [CHAIN.UNICHAIN]: {
    audited: ['0x79b5380FF38462b72e14667742f634c6610158B8'],
    unaudited: [],
  },
  [CHAIN.BERACHAIN]: {
    audited: ['0x8f503B6d9fFdae8d375d1E226b71B4B3144D3849'],
    unaudited: [],
  },
  [CHAIN.BLAST]: {
    audited: ['0x5525e0700390A12995aC181eFF656E4aC0246b29'],
    unaudited: [],
  },
  [CHAIN.MODE]: {
    audited: ['0x8f503B6d9fFdae8d375d1E226b71B4B3144D3849'],
    unaudited: [],
  },
}

interface AutoEvent {
  txid: string;
  implId: number;
  token: string;
  amount: string;
}

// data from event.execution
function decodeAutoEventRequestExtracted(log: any): AutoEvent {
  return {
    txid: log.transactionHash,
    implId: Number(log.args.implId),
    token: `0x${ethers.dataSlice(log.args.execution, 609, 640).slice(24, 64)}`,
    amount: new BigNumber(ethers.dataSlice(log.args.execution, 641, 672), 16).toString(10),
  }
}

// event.execution
// function decodeAutoEventRequestFulfilled(log: any): AutoEvent {
//   return {
//     txid: log.transactionHash,
//     implId: Number(log.args.implId),
//     token: `0x${ethers.dataSlice(log.args.execution, 545, 576).slice(24, 64)}`,
//     amount: new BigNumber(ethers.dataSlice(log.args.execution, 577, 608), 16).toString(10),
//   }
// }

function formatToken(token: string): string {
  return String(token).toLowerCase() === ADDRESSES.GAS_TOKEN_2.toLowerCase() ? ethers.ZeroAddress : token
}

export function fetchBungeeChains(): Array<string> {
  const chains: {[key: string]: boolean} = {}
  for (const chain of Object.keys(SocketGatewayContracts).concat(Object.keys(BungeeGatewayContracts))) {
    chains[chain] = true
  }
  return Object.keys(chains)
}

interface FetchSocketDataParams {
  swapVolume?: boolean;
  bridgeVolume?: boolean;
  fees?: boolean;
}

export async function fetchBungeeData(options: FetchOptions, params: FetchSocketDataParams): Promise<FetchResult> {
  // volume of Swap
  const dailyVolume = options.createBalances()

  // volume of Bridge
  const dailyBridgeVolume = options.createBalances()

  // fees
  const dailyFees = options.createBalances()

  if (params.bridgeVolume) {
    // manual bridge
    if (SocketGatewayContracts[options.chain]) {
      const bridgeEvents: Array<any> = await options.getLogs({
        target: SocketGatewayContracts[options.chain],
        eventAbi: SocketGatewayAbis.SocketBridge,
      })
      for (const event of bridgeEvents) {
        dailyBridgeVolume.add(formatToken(event.token), event.amount)
      }
    }

    // auto bridge
    if (BungeeGatewayContracts[options.chain]) {
      // count bridge volumes on both audited and unaudited contracts
      const requestExtractedEvents: Array<any> = (await options.getLogs({
        targets: BungeeGatewayContracts[options.chain].audited.concat(BungeeGatewayContracts[options.chain].unaudited),
        eventAbi: BungeeGatewayAbis.RequestExtracted,
        onlyArgs: false,
      })).map(log => decodeAutoEventRequestExtracted(log))
      for (const event of requestExtractedEvents) {
        dailyBridgeVolume.add(formatToken(event.token), event.amount)
      }
    }
  }

  if (params.swapVolume) {
    // manual swap
    if (SocketGatewayContracts[options.chain]) {
      const swapEvents: Array<any> = await options.getLogs({
        target: SocketGatewayContracts[options.chain],
        eventAbi: SocketGatewayAbis.SocketSwapTokens,
      })
      for (const event of swapEvents) {
        dailyVolume.add(formatToken(event.fromToken), event.sellAmount)
      }
    }

    // auto swap
    // if (BungeeGatewayContracts[options.chain]) {
    //   let events: Array<any> = [];
    //   if (BungeeGatewayContracts[options.chain].audited.length > 0){
    //     events = events.concat((
    //       await options.getLogs({
    //         targets: BungeeGatewayContracts[options.chain].audited,
    //         eventAbi: BungeeGatewayAbis.RequestFulfilled,
    //         onlyArgs: false,
    //       })).map(log => decodeAutoEventRequestFulfilled(log)
    //     ))
    //   }
    //   if (BungeeGatewayContracts[options.chain].unaudited.length > 0) {
    //     events = events.concat((
    //       await options.getLogs({
    //         targets: BungeeGatewayContracts[options.chain].unaudited,
    //         eventAbi: BungeeGatewayAbis.RequestFulfilled,
    //         onlyArgs: false,
    //       })).map(log => decodeAutoEventRequestFulfilled(log)
    //     ))
    //   }
    //   for (const event of events.filter(item => item.implId === 2)) {
    //     dailyVolume.add(formatToken(event.token), event.amount)
    //   }
    // }
  }

  if (params.fees && SocketGatewayContracts[options.chain]) {
    const feeEvents: Array<any> = await options.getLogs({
      target: SocketGatewayContracts[options.chain],
      eventAbi: SocketGatewayAbis.SocketFeesDeducted,
    })
    for (const event of feeEvents) {
      dailyFees.add(formatToken(event.feesToken), event.fees)
    }
  }

  return {
    dailyVolume,
    dailyBridgeVolume,
    dailyFees,
  }
}
