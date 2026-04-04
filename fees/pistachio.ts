import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const FEE_RATE = 0.0045; // 0.45% - On swaps we take 45 bps (0.45%) - https://www.pistachio.fi/#faq

const chainConfig: Record<string, { address: string, start: string }> = {
  [CHAIN.BASE]: { address:'0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2025-12-27' },
  [CHAIN.ETHEREUM]: { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2025-12-27' },
  [CHAIN.ARBITRUM]: { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2025-12-27' },
  [CHAIN.BSC]: { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2025-12-27' },
  [CHAIN.OPTIMISM]: { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2025-12-27' },
  [CHAIN.SCROLL]: { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2025-12-27' },
  [CHAIN.MANTLE]: { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2025-12-27' },
}

const fetch = async ({ chain, getLogs, createBalances, }: FetchOptions) => {
  const volume = createBalances();

  const data: any[] = await getLogs({
    target: chainConfig[chain].address,
    eventAbi: 'event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)'
  });

  data.forEach((e: any) => {
    if (e.integrator === 'pistachio') {
      volume.add(e.toAssetId, e.toAmount);
    }
  });

  const dailyFees = volume.clone(FEE_RATE, METRIC.SERVICE_FEES);

  return { 
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: "0.45% on cross-chain/same-chain swaps via LiFi",
    Revenue: "0.45% on cross-chain/same-chain swaps via LiFi",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SERVICE_FEES]: "0.45% on cross-chain/same-chain swaps via LiFi",
    },
  }
};

export default adapter;
