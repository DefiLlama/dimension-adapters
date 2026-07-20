import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// wei.domains — the Wei Name Service (WNS), an ENS-style naming service on Ethereum by z0r0z.
// Names are registered by paying ETH into the WNS NFT contract. Unlike its ownerless gwei fork,
// this contract HAS an owner (a DAO), so the ETH paid in is not burned: it is revenue that accrues
// to WNS domain holders, controlled by the DAO.
//
// The registration/renewal events do NOT carry the paid amount and excess msg.value is refunded,
// so the only reliable measure of fees is the contract's own ETH balance growth: the daily increase
// of the WNS NFT balance equals the ETH paid that day.
const WNS = "0x0000000000696760e15f265e828db644a0c242eb";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // getBalance defaults to the latest block, so we must pin it to each window boundary's block,
  // otherwise start == end and the delta is always zero.
  const [balStart, balEnd] = await Promise.all([
    options.fromApi.provider.getBalance(WNS, options.fromApi.block),
    options.toApi.provider.getBalance(WNS, options.toApi.block),
  ]);

  // Balance grows as names are registered/renewed; guard against reorg/RPC noise producing a negative.
  const delta = BigInt(balEnd) - BigInt(balStart);
  if (delta > 0n) dailyFees.addGasToken(delta, METRIC.SERVICE_FEES);

  // Fees are revenue that accrues to WNS domain holders (via the DAO owner).
  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-06-26",
  methodology: {
    Fees: "ETH paid by users to register and renew .wei names, measured as the daily increase of the WNS NFT contract's ETH balance.",
    Revenue: "All fees accrue to the DAO-owned WNS contract as revenue.",
    HoldersRevenue: "All revenue accrues to WNS domain holders, controlled by the DAO.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.SERVICE_FEES]: "Name registration and renewal fees paid in ETH." },
  },
};

export default adapter;
