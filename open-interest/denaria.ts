import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DENARIA_PERP_PAIR_OLD = '0xd07822ee341c11a193869034d7e5f583c4a94872';
const DENARIA_PERP_PAIR_NEW = '0xb68396dd4230253d27589e2004ac37389836ae17';
const DENARIA_PERP_PAIR_NEW_DEPLOY_BLOCK = 29416825;

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

const methodology = {
  OpenInterest: "Trader exposure (totalTraderExposure, in BTC) of Denaria's own vAMM perp engine on Linea, until trading stopped after the April 2026 exploit. The engine was sunset on 2026-09-03: Denaria trading moved to GMX V2 on Arbitrum, tracked by the separate denaria-gmx adapter.",
};

const adapter: SimpleAdapter = {
  version: 2,
  // Open interest is a snapshot read at the window end; hourly records would be summed
  // into the daily value and inflate it 24x.
  pullHourly: false,
  chains: [CHAIN.LINEA],
  fetch,
  start: "2025-12-15",
  // Trading stopped after the 2026-04-05 exploit (last ExecutedTrade 2026-04-06 23:07 UTC)
  // and the vault was drained. totalTraderExposure has been frozen at 2.1183 BTC since
  // 2026-04-06, so later reads are a stale contract value priced at the BTC rate, not open
  // positions. The engine was formally sunset on 2026-09-03 (GMX activity lives in
  // open-interest/denaria-gmx.ts).
  deadFrom: "2026-04-07",
  methodology,
};

export default adapter;
