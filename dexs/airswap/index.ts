import { Fetch, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap = 'event SwapERC20(uint256 indexed nonce,address indexed signerWallet,address signerToken,uint256 signerAmount,uint256 protocolFee,address indexed senderWallet,address senderToken,uint256 senderAmount)';

type TAddress = {
  [c: string]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0xd82fa167727a4dc6d6f55830a2c47abbb4b3a0f8',
  [CHAIN.POLYGON]: '0xd82fa167727a4dc6d6f55830a2c47abbb4b3a0f8',
  [CHAIN.AVAX]: '0xd82FA167727a4dc6D6F55830A2c47aBbB4b3a0F8',
  [CHAIN.BSC]: '0xd82fa167727a4dc6d6f55830a2c47abbb4b3a0f8',
  [CHAIN.ARBITRUM]: '0xd82FA167727a4dc6D6F55830A2c47aBbB4b3a0F8'
}

const fetch = (async (timestamp: number, _: any, { getLogs, createBalances, chain }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances();

  const logs = (await getLogs({
    target: address[chain],
    eventAbi: event_swap,
  }))
  logs.forEach(i => dailyVolume.add(i.signerToken, i.signerAmount))
  return { dailyVolume, timestamp, };
}) as Fetch

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2023-04-01', },
    [CHAIN.POLYGON]: { fetch, start: '2023-04-01', },
    [CHAIN.AVAX]: { fetch, start: '2023-04-01', },
    [CHAIN.BSC]: { fetch, start: '2023-04-01', },
    [CHAIN.ARBITRUM]: { fetch, start: '2023-07-20', },
  }
};

export default adapter;
