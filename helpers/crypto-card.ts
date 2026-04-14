import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { addTokensReceived } from "./token";
import coreAssets from "./coreAssets.json";
import { formatAddress } from "../utils/utils";

const DefaultPaymentTokens: Record<string, Array<string>> = {
  [CHAIN.ETHEREUM]: [
    coreAssets.ethereum.USDC,
    coreAssets.ethereum.USDT,
  ],
  [CHAIN.POLYGON]: [
    coreAssets.polygon.USDC,
    coreAssets.polygon.USDC_CIRCLE,
    coreAssets.polygon.USDT,
  ],
  [CHAIN.BASE]: [
    coreAssets.base.USDC,
    coreAssets.base.USDT,
  ],
  [CHAIN.ARBITRUM]: [
    coreAssets.arbitrum.USDC,
    coreAssets.arbitrum.USDC_CIRCLE,
    coreAssets.arbitrum.USDT,
  ],
  [CHAIN.OPTIMISM]: [
    coreAssets.optimism.USDC,
    coreAssets.optimism.USDC_CIRCLE,
    coreAssets.arbitrum.USDT,
  ],
  [CHAIN.AVAX]: [
    coreAssets.avax.USDC,
    coreAssets.avax.USDt,
  ],
  [CHAIN.XDAI]: [
    coreAssets.xdai.USDC,
    coreAssets.xdai.EURe,
  ],
  [CHAIN.ERA]: [
    coreAssets.era.USDC,
  ],
  [CHAIN.BSC]: [
    coreAssets.bsc.USDC,
    coreAssets.bsc.USDT,
  ],
}

interface CryptoCardAdapterConfig {
  paymentRecipients: Array<string>;
  paymentTokens?: Array<string>;
  excludeWallets?: Array<string>;
  start?: string;
}

export function cryptoCardAdapterExport(exportConfig: Record<string, CryptoCardAdapterConfig>) {
  const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: Object.keys(exportConfig),
    fetch: async (options: FetchOptions) => {
      const dailyVolume = await addTokensReceived({
        options,
        targets: exportConfig[options.chain].paymentRecipients,
        tokens: exportConfig[options.chain].paymentTokens || DefaultPaymentTokens[options.chain],
        logFilter: (log: any) => {
          let targets = exportConfig[options.chain].excludeWallets || [];
          targets = targets.concat(exportConfig[options.chain].paymentRecipients.map((t: any) => formatAddress(t)));
          return !targets.includes(log.from_address);
        }
      })
    
      return { dailyVolume };
    },
  };
  
  return adapter;
}

const CypherCardPaymentRecipients = [
  '0xcfdAb76b36B33dA54c08314A9F265588B67170dc',
  '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD',
  '0x3cb7367aC1E6a439dA1f1717f8055f02E3C9d56e',
  '0x154E719D0513B015194b8C6977e524508bb35276',
];

const NexoCardPaymentRecipients = [
  '0x1a706EB4F22FDc03EE4624cF195cD9dABED2C264',
  '0x0762AeFe72042F62775ee71ef94E9e050402fA07',
  '0x1D85f929EE6AEDc3b4981d8FE408Ae43942b2e53',
  '0xB60C61DBb7456f024f9338c739B02Be68e3F545C',
];

const HolyheldPaymentRecipients = [
  '0x0146dca5eD7fAc1Dd53A2791089E109645732E1c',
  '0xc2c850faf8a7e11566b2e0e8edd91137d088087d',
];

const RedotpayPaymentRecipients = [
  '0x43D1508417335a314483FaA40eB590cC0503987c',
  '0x84c0e85a8aeB537c5b12cC5D9cd168bFE3390673',
  '0x3ba1be1619e9c93c861a6eb252974274f75b72aa',
];

const cryptoCardProtocols: Record<string, SimpleAdapter> = {
  'cypher-card': cryptoCardAdapterExport({
    [CHAIN.ETHEREUM]: {
      start: '2023-12-09',
      paymentRecipients: CypherCardPaymentRecipients,
    },
    [CHAIN.POLYGON]: {
      start: '2023-12-09',
      paymentRecipients: CypherCardPaymentRecipients,
    },
    [CHAIN.BASE]: {
      start: '2023-12-09',
      paymentRecipients: CypherCardPaymentRecipients,
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-12-09',
      paymentRecipients: CypherCardPaymentRecipients,
    },
    [CHAIN.OPTIMISM]: {
      start: '2023-12-09',
      paymentRecipients: CypherCardPaymentRecipients,
    },
    [CHAIN.AVAX]: {
      start: '2023-12-09',
      paymentRecipients: CypherCardPaymentRecipients,
    },
  }),
  'bleap-card': cryptoCardAdapterExport({
    [CHAIN.ARBITRUM]: {
      start: '2024-10-25',
      paymentRecipients: ['0x476756C3d75A05757E3e8abaD6736EA6AB14675f'],
      paymentTokens: [
        ...DefaultPaymentTokens[CHAIN.ARBITRUM],
        '0xfa5ed56a203466cbbc2430a43c66b9d8723528e7',
        '0x0c06ccf38114ddfc35e07427b9424adcca9f44f8',
      ]
    },
  }),
  'nexo-card': cryptoCardAdapterExport({
    [CHAIN.ETHEREUM]: {
      start: '2022-11-01',
      paymentRecipients: NexoCardPaymentRecipients,
    },
    [CHAIN.POLYGON]: {
      start: '2022-11-01',
      paymentRecipients: NexoCardPaymentRecipients,
    },
    [CHAIN.BASE]: {
      start: '2022-11-01',
      paymentRecipients: NexoCardPaymentRecipients,
    },
    [CHAIN.ARBITRUM]: {
      start: '2022-11-01',
      paymentRecipients: NexoCardPaymentRecipients,
    },
    [CHAIN.OPTIMISM]: {
      start: '2022-11-01',
      paymentRecipients: NexoCardPaymentRecipients,
    },
    [CHAIN.AVAX]: {
      start: '2022-11-01',
      paymentRecipients: NexoCardPaymentRecipients,
    },
  }),
  'holyheld': cryptoCardAdapterExport({
    [CHAIN.ETHEREUM]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.POLYGON]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.BASE]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.OPTIMISM]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.AVAX]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.XDAI]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.ERA]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
    [CHAIN.BSC]: {
      start: '2023-04-01',
      paymentRecipients: HolyheldPaymentRecipients,
    },
  }),
  'redotpay': cryptoCardAdapterExport({
    [CHAIN.ETHEREUM]: {
      start: '2022-11-01',
      paymentRecipients: RedotpayPaymentRecipients,
    },
    [CHAIN.POLYGON]: {
      start: '2022-11-01',
      paymentRecipients: RedotpayPaymentRecipients,
    },
    [CHAIN.BASE]: {
      start: '2022-11-01',
      paymentRecipients: RedotpayPaymentRecipients,
    },
    [CHAIN.AVAX]: {
      start: '2022-11-01',
      paymentRecipients: RedotpayPaymentRecipients,
    },
    [CHAIN.OPTIMISM]: {
      start: '2022-11-01',
      paymentRecipients: RedotpayPaymentRecipients,
    },
    [CHAIN.ARBITRUM]: {
      start: '2022-11-01',
      paymentRecipients: RedotpayPaymentRecipients,
    },
  }),
};

export const protocolList = Object.keys(cryptoCardProtocols);
export const getAdapter = (name: string) => cryptoCardProtocols[name];
