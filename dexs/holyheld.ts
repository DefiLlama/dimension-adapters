import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import coreAssets from "../helpers/coreAssets.json";

const paymentRecipientMultichain = '0x0146dca5eD7fAc1Dd53A2791089E109645732E1c';
const paymentRecipientMultichain2 = '0xc2c850faf8a7e11566b2e0e8edd91137d088087d';

const configs: Record<string, { paymentRecipients: Array<string>, paymentTokens: Array<string>, start: string }> = {
  [CHAIN.POLYGON]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.polygon.USDC,
      coreAssets.polygon.USDC_CIRCLE,
    ],
  },
  [CHAIN.AVAX]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.avax.USDC,
      coreAssets.avax.EURC,
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.ethereum.USDC,
      coreAssets.ethereum.USDT,
      coreAssets.ethereum.EURC,
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.optimism.USDC,
      coreAssets.optimism.USDC_CIRCLE,
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.arbitrum.USDC,
      coreAssets.arbitrum.USDC_CIRCLE,
    ],
  },
  [CHAIN.BASE]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.base.USDC,
      coreAssets.base.EURC,
    ],
  },
  [CHAIN.XDAI]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.xdai.USDC,
      coreAssets.xdai.EURe,
    ],
  },
  [CHAIN.ERA]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.era.USDC,
    ],
  },
  [CHAIN.BSC]: {
    start: '2023-04-01',
    paymentRecipients: [
      paymentRecipientMultichain,
      paymentRecipientMultichain2,
    ],
    paymentTokens: [
      coreAssets.bsc.USDC,
      coreAssets.bsc.USDT,
    ],
  },
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = await addTokensReceived({
    options,
    targets: configs[options.chain].paymentRecipients,
    tokens: configs[options.chain].paymentTokens,
  })

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: configs
};

export default adapter;