import { CHAIN } from "../helpers/chains";
import { Chain, FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { queryEvents } from '../helpers/sui';

type TChainAddress = {
  [s: Chain | string]: string[];
}

const lpTokenAddresses: TChainAddress = {
  [CHAIN.ETHEREUM]: [
    '0xa7062bbA94c91d565Ae33B893Ab5dFAF1Fc57C4d',
    '0x7DBF07Ad92Ed4e26D5511b4F285508eBF174135D',
    '0xcaB34d4D532A9c9929f4f96D239653646351Abad',
  ],
  [CHAIN.BSC]: [
    '0x8033d5b454Ee4758E4bD1D37a49009c1a81D8B10',
    '0xf833afA46fCD100e62365a0fDb0734b7c4537811',
    '0x731822532CbC1c7C48462c9e5Dc0c04A1Ff29953',
  ],
  [CHAIN.POLYGON]: [
    '0x58Cc621c62b0aa9bABfae5651202A932279437DA',
    '0x0394c4f17738A10096510832beaB89a9DD090791',
    '0x4C42DfDBb8Ad654b42F66E0bD4dbdC71B52EB0A6',
  ],
  [CHAIN.ARBITRUM]: [
    '0x690e66fc0F8be8964d40e55EdE6aEBdfcB8A21Df',
    '0x47235cB71107CC66B12aF6f8b8a9260ea38472c7',
    '0x2B5E5E6008742Cd9D139c6ADd9CaC57679C59D6d',
  ],
  [CHAIN.AVAX]: [
    '0xe827352A0552fFC835c181ab5Bf1D7794038eC9f',
    '0x2d2f460d7a1e7a4fcC4Ddab599451480728b5784',
  ],
  [CHAIN.BASE]: [
    '0xDA6bb1ec3BaBA68B26bEa0508d6f81c9ec5e96d5',
  ],
  [CHAIN.OPTIMISM]: [
    '0x3B96F88b2b9EB87964b852874D41B633e0f1f68F',
    '0xb24A05d54fcAcfe1FC00c59209470d4cafB0deEA',
  ],
  [CHAIN.CELO]: [
    '0xfb2C7c10e731EBe96Dabdf4A96D656Bfe8e2b5Af',
  ],
  [CHAIN.SONIC]: [
    '0xCA0dc31BdA6B7588590a742b2Ae6A4F67b43c71F',
  ],
  [CHAIN.UNICHAIN]: [
    '0xBA2FBA24B0dD81a67BBdD95bB7a9d0336ea094D7',
    '0xD0a1Ff86C2f1c3522f183400fDE355f6B3d9fCE1',
  ],
  [CHAIN.TRON]: [
    'TAC21biCBL9agjuUyzd4gZr356zRgJq61b'
  ]
}

const SUI_EVENT_TYPES = [
  "0x83d6f864a6b0f16898376b486699aa6321eb6466d1daf6a2e3764a51908fe99d::events::SwappedToVUsdEvent",
  "0x83d6f864a6b0f16898376b486699aa6321eb6466d1daf6a2e3764a51908fe99d::events::SwappedFromVUsdEvent",
];

const event_swap_fromUSD = 'event SwappedFromVUsd(address recipient,address token,uint256 vUsdAmount,uint256 amount,uint256 fee)';
const event_swap_toUSD = 'event SwappedToVUsd(address sender,address token,uint256 amount,uint256 vUsdAmount,uint256 fee)';

const fetchFees = async ({ getLogs, createBalances, chain, api }: FetchOptions): Promise<number> => {
  const balances = createBalances();
  const pools = lpTokenAddresses[chain]
  const logs_fromUSD = await getLogs({ targets: pools, eventAbi: event_swap_fromUSD, flatten: false, })
  const logs_toUSD = await getLogs({ targets: pools, eventAbi: event_swap_toUSD, flatten: false, })
  const tokens = await api.multiCall({ abi: "address:token", calls: pools });

  logs_fromUSD.forEach(addLogs)
  logs_toUSD.forEach(addLogs)

  function addLogs(logs: any, index: number) {
    const token = tokens[index]
    logs.forEach((log: any) => balances.add(token, log.fee))
  }
  return balances.getUSDValue();
};

const fetchFeesSui = async (options: FetchOptions): Promise<number> => {
  const { createBalances } = options;
  const balances = createBalances();

  for (const eventType of SUI_EVENT_TYPES) {
    const events = await queryEvents({
      eventType,
      options,
    });
    events.forEach((eventData) => balances.add('0x' + eventData.token, eventData.fee));
  }

  return balances.getUSDValue();
};

export async function fetchFeesAmountFromAnalyticsApi(
  chainCode: string,
  options: FetchOptions,
): Promise<number> {
  const { createBalances, startOfDay, toTimestamp } = options;
  const balances = createBalances();

  const eventData = await getEventsFromAnalyticsApi(chainCode, startOfDay * 1000, toTimestamp * 1000);
  eventData.map((data) => balances.add(data.token, data.fee));

  return balances.getUSDValue();
}

interface AnalyticsEvent {
  token: string;
  fee: string;
}

export async function getEventsFromAnalyticsApi(
  chainCode: string,
  fromTimestampMs: number,
  toTimestampMs: number,
): Promise<AnalyticsEvent[]> {
  const from = new Date(fromTimestampMs).toISOString();
  const to = new Date(toTimestampMs).toISOString();
  return await httpGet(`https://core.api.allbridgecoreapi.net/analytics/inflows?chain=${chainCode}&from=${from}&to=${to}`);
}

const fetch: any = async (options: FetchOptions) => {
  let dailyFees: number;
  if (options.chain === CHAIN.TRON) {
    dailyFees = await fetchFeesAmountFromAnalyticsApi('TRX', options);
  } else if (options.chain === CHAIN.SUI) {
    dailyFees = await fetchFeesSui(options);
  } else if (options.chain === CHAIN.STELLAR) {
    dailyFees = await fetchFeesAmountFromAnalyticsApi('SRB', options);
  } else {
    dailyFees = await fetchFees(options);
  }
  const dailyRevenue = dailyFees * 0.2;
  const dailySupplySideRevenue = dailyFees * 0.8;
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "A 0.3% fee is charged for token swaps",
  SupplySideRevenue: "80% of the swap fees are distributed to liquidity providers",
  Revenue: "20% of the swap fees goes to governance",
};

const adapters: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-05-14', },
    [CHAIN.BSC]: { start: '2023-05-14', },
    [CHAIN.POLYGON]: { start: '2023-05-14', },
    [CHAIN.ARBITRUM]: { start: '2023-06-27', },
    [CHAIN.AVAX]: { start: '2023-10-23', },
    [CHAIN.BASE]: { start: '2024-02-01', },
    [CHAIN.OPTIMISM]: { start: '2023-12-18', },
    [CHAIN.CELO]: { start: '2024-05-13', },
    [CHAIN.SONIC]: { start: '2025-05-27', },
    [CHAIN.UNICHAIN]: { start: '2025-08-26', },
    [CHAIN.TRON]: { start: '2023-05-26', },
    [CHAIN.SUI]: { start: "2025-01-24", },
    [CHAIN.STELLAR]: { start: "2024-04-16", },
  },
};

export default adapters;
