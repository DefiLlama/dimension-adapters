import { FetchOptions,Adapter } from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

const event_order_buy_fulfilled = 'event ERC721BuyOrderFilled(bytes32 orderHash, address maker, address taker, uint256 nonce, address erc20Token, uint256 erc20TokenAmount, tuple(address recipient, uint256 amount)[] fees, address erc721Token, uint256 erc721TokenId)';
const event_order_sell_fulfilled = 'event ERC721SellOrderFilled(bytes32 orderHash, address maker, address taker, uint256 nonce, address erc20Token, uint256 erc20TokenAmount, tuple(address recipient, uint256 amount)[] fees, address erc721Token, uint256 erc721TokenId)';
const event_erc1155_buy_filled = 'event ERC1155BuyOrderFilled(bytes32 orderHash, address maker, address taker, uint256 nonce, address erc20Token, uint256 erc20FillAmount, tuple(address recipient, uint256 amount)[] fees, address erc1155Token, uint256 erc1155TokenId, uint128 erc1155FillAmount)';
const event_erc1155_sell_filled = 'event ERC1155SellOrderFilled(bytes32 orderHash, address maker, address taker, uint256 nonce, address erc20Token, uint256 erc20FillAmount, tuple(address recipient, uint256 amount)[] fees, address erc1155Token, uint256 erc1155TokenId, uint128 erc1155FillAmount)';

interface ElementConfig {
  markets: Array<string>;
  feeCollector: string;
  start: string;
}

const DefaltFeeAddress = '0x7538262Ae993ca117A0e481f908209137A46268e'

const elementConfigs: Record<string,ElementConfig> = {
  [CHAIN.ETHEREUM]: {
    markets: [
      '0x20F780A973856B93f63670377900C1d2a50a77c4',
    ],
    feeCollector: DefaltFeeAddress,
    start: '2022-04-16',
  },
  [CHAIN.BSC]: {
    markets: [
      '0xb3e3DfCb2d9f3DdE16d78B9e6EB3538Eb32B5ae1',
    ],
    feeCollector: DefaltFeeAddress,
    start: '2022-04-16',
  },
  [CHAIN.POLYGON]: {
    markets: [
      '0xEAF5453b329Eb38Be159a872a6ce91c9A8fb0260',
    ],
    feeCollector: DefaltFeeAddress,
    start: '2022-04-16',
  },
  [CHAIN.ARBITRUM]: {
    markets: [
      '0x18cd9270DbdcA86d470cfB3be1B156241fFfA9De',
    ],
    feeCollector: DefaltFeeAddress,
    start: '2023-03-24',
  },
  [CHAIN.BASE]: {
    markets: [
      '0xa39A5f160a1952dDf38781Bd76E402B0006912A9',
    ],
    feeCollector: DefaltFeeAddress,
    start: '2023-08-09',
  },
}

const fetch = async ({ chain, getLogs, createBalances }: FetchOptions) => {
  const elementConfig = elementConfigs[chain];
  if (!elementConfig) throw new Error(`No config found for chain: ${chain}`);

  const buy721logs = await getLogs({ targets: elementConfig.markets, eventAbi: event_order_buy_fulfilled, flatten: true });
  const sell721logs = await getLogs({ targets: elementConfig.markets, eventAbi: event_order_sell_fulfilled, flatten: true });
  const buy1155logs = await getLogs({ targets: elementConfig.markets, eventAbi: event_erc1155_buy_filled, flatten: true });
  const sell1155logs = await getLogs({ targets: elementConfig.markets, eventAbi: event_erc1155_sell_filled, flatten: true });

  const logs = [
    ...buy721logs,
    ...sell721logs,
    ...buy1155logs,
    ...sell1155logs,
  ];

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  for (const log of logs) {
    for (const fee of log.fees) {
      if (fee.recipient.toLowerCase() === elementConfig.feeCollector.toLowerCase()) {
        dailyRevenue.add(log.erc20Token, fee.amount)
      } else {
        dailySupplySideRevenue.add(log.erc20Token, fee.amount)
      }
      dailyFees.add(log.erc20Token, fee.amount)
    }
  }
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: 'Fees paid by traders while trade NFT on Element market.',
    Revenue: 'Share of trading fees to Element.',
    ProtocolRevenue: 'Share of trading fees to Element.',
    SupplySideRevenue: 'Share of trading fees to creators.',
  },
  fetch,
  adapter: {},
}

for (const [chain, config] of Object.entries(elementConfigs)) {
  (adapter.adapter as any)[chain] = {
    start: config.start,
  }
}

export default adapter
