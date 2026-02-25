import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DENARIA_PERP_PAIR_OLD = '0xd07822ee341c11a193869034d7e5f583c4a94872';
const DENARIA_PERP_PAIR_NEW = '0xb4e7516844de6590a3b49c7dcb231a92bf022556';
const DENARIA_PERP_PAIR_NEW_DEPLOY_BLOCK = 29081146;

async function fetch(options: FetchOptions) {
  const toBlock = await options.getToBlock();
  const oiTarget = toBlock >= DENARIA_PERP_PAIR_NEW_DEPLOY_BLOCK ? DENARIA_PERP_PAIR_NEW : DENARIA_PERP_PAIR_OLD;

  const totalTraderExposure = await options.api.call({
    target: oiTarget,
    abi: "uint256:totalTraderExposure",
    block: toBlock,
  });

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addCGToken("bitcoin", Number(totalTraderExposure) / 1e18);

  return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.LINEA],
  fetch,
  start: "2025-12-15",
};

export default adapter;
