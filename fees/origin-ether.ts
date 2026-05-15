import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchOriginFees } from "../helpers/origin-protocol";

// OETH on Ethereum + SuperOETH (superOETHb) on Base both roll up under the
// `origin-ether` DefiLlama protocol page.
const KEYS_BY_CHAIN: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ["oeth"],
  [CHAIN.BASE]: ["superOethb"],
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  return fetchOriginFees(KEYS_BY_CHAIN[options.chain] ?? [])(options);
};

const methodology = {
  Fees: "Yield earned by Origin Ether (OETH) vault strategies on Ethereum and Super OETH (superOETHb) on Base, before Origin's performance fee.",
  Revenue: "Origin's performance-fee share of OETH/superOETHb yield, apportioned from the protocol-wide revenue figure by each product's share of total Origin fees.",
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
