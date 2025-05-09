import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResult, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ZeroAddress } from "ethers";

type IContract = {
  [c: string | Chain]: string;
}

const SocketGatewayAbis = {
  SocketBridge: 'event SocketBridge(uint256 amount, address token, uint256 toChainId, bytes32 bridgeName, address sender, address receiver, bytes32 metadata)',
  SocketSwapTokens: 'event SocketSwapTokens(address fromToken, address toToken, uint256 buyAmount, uint256 sellAmount, bytes32 routeName, address receiver, bytes32 metadata)',
  SocketFeesDeducted: 'event SocketFeesDeducted (uint256 fees, address feesTaker, address feesToken)',
}

export const SocketGatewayContracts: IContract = {
  [CHAIN.AURORA]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.ARBITRUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.OPTIMISM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BASE]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BLAST]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.ETHEREUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
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

interface FetchSocketDataParams {
  volume?: boolean;
  bridgeVolume?: boolean;
  fees?: boolean;
}

export async function fetchSocketData(options: FetchOptions, params: FetchSocketDataParams): Promise<FetchResult> {
  // volume of Swap
  const dailyVolume = options.createBalances()

  // volume of Bridge
  const dailyBridgeVolume = options.createBalances()

  // fees
  const dailyFees = options.createBalances()

  if (params.bridgeVolume) {
    const bridgeEvents: Array<any> = await options.getLogs({
      target: SocketGatewayContracts[options.chain],
      eventAbi: SocketGatewayAbis.SocketBridge,
    })
    for (const event of bridgeEvents) {
      dailyBridgeVolume.add(event.token, event.amount)
    }
  }

  if (params.volume) {
    const swapEvents: Array<any> = await options.getLogs({
      target: SocketGatewayContracts[options.chain],
      eventAbi: SocketGatewayAbis.SocketSwapTokens,
    })
    for (const event of swapEvents) {
      dailyVolume.add(event.fromToken, event.sellAmount)
    }
  }

  if (params.fees) {
    const feeEvents: Array<any> = await options.getLogs({
      target: SocketGatewayContracts[options.chain],
      eventAbi: SocketGatewayAbis.SocketFeesDeducted,
    })
    for (const event of feeEvents) {
      let token = event.feesToken
      if (String(token).toLowerCase() === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase()) {
        token = ZeroAddress
      }

      dailyFees.add(event.feesToken, event.fees)
    }
  }

  return {
    dailyVolume,
    dailyBridgeVolume,
    dailyFees,
  }
}

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyBridgeVolume } = await fetchSocketData(options, { bridgeVolume: true })
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(SocketGatewayContracts).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: '2023-08-10', }
    }
  }, {})
};

export default adapter;
