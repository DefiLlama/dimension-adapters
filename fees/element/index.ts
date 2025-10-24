import { FetchOptions,Adapter } from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

const contract_ethereum = `0x20F780A973856B93f63670377900C1d2a50a77c4`;
const contract_bsc = `0xb3e3DfCb2d9f3DdE16d78B9e6EB3538Eb32B5ae1`;
const contract_polygon = `0xEAF5453b329Eb38Be159a872a6ce91c9A8fb0260`;
const contract_arbitrum = `0x18cd9270DbdcA86d470cfB3be1B156241fFfA9De`;
const contract_base = '0xa39A5f160a1952dDf38781Bd76E402B0006912A9';
const defaltFeeAddress = '0x7538262Ae993ca117A0e481f908209137A46268e'.toLowerCase();

const event_order_buy_fulfilled = `event ERC721BuyOrderFilled(
  bytes32 orderHash,
  address maker,
  address taker,
  uint256 nonce,
  address erc20Token,
  uint256 erc20TokenAmount,
  tuple(address recipient, uint256 amount)[] fees,
  address erc721Token,
  uint256 erc721TokenId
)`;

const event_order_sell_fulfilled = `event ERC721SellOrderFilled(
  bytes32 orderHash,
  address maker,
  address taker,
  uint256 nonce,
  address erc20Token,
  uint256 erc20TokenAmount,
  tuple(address recipient, uint256 amount)[] fees,
  address erc721Token,
  uint256 erc721TokenId
)`;

const event_erc1155_buy_filled = `event ERC1155BuyOrderFilled(
  bytes32 orderHash,
  address maker,
  address taker,
  uint256 nonce,
  address erc20Token,
  uint256 erc20FillAmount,
  tuple(address recipient, uint256 amount)[] fees,
  address erc1155Token,
  uint256 erc1155TokenId,
  uint128 erc1155FillAmount
)`;

const event_erc1155_sell_filled = `event ERC1155SellOrderFilled(
  bytes32 orderHash,
  address maker,
  address taker,
  uint256 nonce,
  address erc20Token,
  uint256 erc20FillAmount,
  tuple(address recipient, uint256 amount)[] fees,
  address erc1155Token,
  uint256 erc1155TokenId,
  uint128 erc1155FillAmount
)`;

const config: any = {
  ethereum: {
    targets: [contract_ethereum],
    fees_collector: defaltFeeAddress,
  },
  bsc: {
    targets: [contract_bsc],
    fees_collector: defaltFeeAddress,
  },
  polygon: {
    targets: [contract_polygon],
    fees_collector: defaltFeeAddress,
  },
  arbitrum: {
    targets: [contract_arbitrum],
    fees_collector: defaltFeeAddress,
  },
  base: {
    targets: [contract_base],
    fees_collector: defaltFeeAddress,
  },
};

// ✅ fetch 函数
const fetch = async ({ chain, getLogs, createBalances }: FetchOptions) => {
  const chainInfo = config[chain];
  if (!chainInfo) throw new Error(`No config found for chain: ${chain}`);

  const buy721logs = await getLogs({ targets: chainInfo.targets, eventAbi: event_order_buy_fulfilled });
  const sell721logs = await getLogs({ targets: chainInfo.targets, eventAbi: event_order_sell_fulfilled });
  const buy1155logs = await getLogs({ targets: chainInfo.targets, eventAbi: event_erc1155_buy_filled });
  const sell1155logs = await getLogs({ targets: chainInfo.targets, eventAbi: event_erc1155_sell_filled });

  const logs = [
    ...buy721logs,
    ...sell721logs,
    ...buy1155logs,
    ...sell1155logs,
  ];

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  for (const log of logs) {
    for (const fee of log.fees) {
      if (fee.recipient.toLowerCase() === chainInfo.fees_collector) {
        dailyRevenue.add(log.erc20Token, fee.amount)
      }
      dailyFees.add(log.erc20Token, fee.amount)
    }
  }
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    },
    [CHAIN.BASE]: {
      fetch,
    },
    [CHAIN.ARBITRUM]: {
      fetch,
    },
    [CHAIN.POLYGON]: {
      fetch,
    },
    [CHAIN.BSC]: {
      fetch,
    }
  },
  version: 2
}
export default adapter