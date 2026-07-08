import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// gwei.domains (GNS) — an ownerless ENS-style naming service on Ethereum, a fork of z0r0z's wei-names.
// Names are registered by paying ETH (fee is a fixed constant by label length, plus a decaying
// premium on recently-expired names). The contract has NO owner and NO withdraw function, so every
// wei paid in is locked in the contract forever — effectively burned.
//
// The registration/renewal events (NameRegistered / NameRenewed) do NOT carry the paid amount, and
// excess msg.value is refunded, so the only reliable measure of fees is the contract's own ETH
// balance growth: the daily increase of the NameNFT balance equals the ETH paid (= burned) that day.
const NAME_NFT = "0x9d51d507bc7264d4fe8ad1cf7fe191933a0a81d6";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // getBalance defaults to the latest block, so we must pin it to each window boundary's block,
  // otherwise start == end and the delta is always zero.
  const [balStart, balEnd] = await Promise.all([
    options.fromApi.provider.getBalance(NAME_NFT, options.fromApi.block),
    options.toApi.provider.getBalance(NAME_NFT, options.toApi.block),
  ]);

  // Balance only ever grows (no withdraw); guard against tiny reorg/RPC noise producing a negative.
  const delta = BigInt(balEnd) - BigInt(balStart);
  if (delta > 0n) dailyFees.addGasToken(delta, METRIC.SERVICE_FEES);

  // All fees are locked in the contract forever, so they are revenue that is fully burned.
  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-06-26",
  isExpensiveAdapter: true,
  methodology: {
    Fees: "ETH paid by users to register and renew .gwei names, measured as the daily increase of the NameNFT contract's ETH balance.",
    Revenue: "All fees are permanently locked in the ownerless contract (no owner, no withdraw), so 100% of fees are burned.",
    HoldersRevenue: "All fees are burned (locked forever), accruing to ETH holders as a supply reduction.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.SERVICE_FEES]: "Name registration and renewal fees paid in ETH." },
  },
};

export default adapter;
