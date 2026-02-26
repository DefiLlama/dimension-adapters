import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ZeroAddress } from "ethers";

const SocketGatewayAbis = {
  SocketFeesDeducted: 'event SocketFeesDeducted (uint256 fees, address feesTaker, address feesToken)',
}

export const SocketGatewayContracts: { [key: string]: string } = {
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

const fetch: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()

  const feeEvents: Array<any> = await options.getLogs({
    target: SocketGatewayContracts[options.chain],
    eventAbi: SocketGatewayAbis.SocketFeesDeducted,
  })
  for (const event of feeEvents) {
    let token = event.feesToken
    if (String(token).toLowerCase() === ADDRESSES.GAS_TOKEN_2.toLowerCase()) {
      token = ZeroAddress
    }

    dailyFees.add(token, event.fees)
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: 0 }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.keys(SocketGatewayContracts).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch, start: '2023-08-10',
      }
    }
  }, {}),
  methodology: {
    Fees: 'Total fees paid by users for bridging tokens.',
    Revenue: 'Total fees paid are distributed to SOCKET inetrgations.',
    ProtocolRevenue: 'SOCKET takes 0 fees.',
  }
};

export default adapter;
