import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchOriginFees, OriginProduct } from "../helpers/origin-protocol";

const PRODUCTS_BY_CHAIN: Record<string, OriginProduct[]> = {
  [CHAIN.ETHEREUM]: [
    { apiKey: "oeth", vault: "0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab", feeAbi: "uint256:trusteeFeeBps" },
  ],
  [CHAIN.BASE]: [
    { apiKey: "superOethb", vault: "0x98a0CbeF61bD2D21435f433bE4CD42B56B38CC93", feeAbi: "uint256:trusteeFeeBps" },
  ],
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  return fetchOriginFees(PRODUCTS_BY_CHAIN[options.chain] ?? [])(options);
};

const methodology = {
  Fees: "Yield earned by Origin Ether (OETH) vault strategies on Ethereum and Super OETH (superOETHb) on Base, before Origin's performance fee.",
  Revenue: "Per-product yield × trusteeFeeBps read on-chain from each vault (OETH and superOETHb both 20%).",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Yield (net of performance fee) received by OETH and Super OETH holders via rebase.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2023-05-08' },
    [CHAIN.BASE]: { fetch, start: '2024-09-11' },
  },
};

export default adapter;
