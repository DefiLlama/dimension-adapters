import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

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

const graph = (chain: Chain) => {
  return async ({ createBalances, getLogs,}: FetchOptions) => {
    const dailyFees = createBalances();

    (await getLogs({
      target: address[chain],
      eventAbi: event_swap,
    })).map((e: any) => {
      dailyFees.add(e.signerToken, e.signerAmount.toString() * e.protocolFee.toString() / 10000, METRIC.SWAP_FEES)
    })
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }
}

const methodology = {
    Fees: 'Swap fees paid by users.',
    Revenue: 'All fees are revenue.',
    ProtocolRevenue: 'All revenue are collected by AirSwap.',
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: 'Protocol fees charged on each peer-to-peer token swap, calculated as a percentage of the signer amount.',
    },
    Revenue: {
        [METRIC.SWAP_FEES]: 'All swap fees are collected as protocol revenue since there are no liquidity providers in P2P swaps.',
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: 'All swap fees go directly to the AirSwap protocol.',
    },
}

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: '2023-04-01',
    },
    [CHAIN.POLYGON]: {
      fetch: graph(CHAIN.POLYGON),
      start: '2023-04-01',
    },
    [CHAIN.AVAX]: {
      fetch: graph(CHAIN.AVAX),
      start: '2023-04-01',
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: '2023-04-01',
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: '2023-07-20',
    },
  }
};

export default adapter;
