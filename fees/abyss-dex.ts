import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { getPositionedLogArgs, PositionedLogArgs } from "../helpers/logs";

// Replacement deployment and initial buyback recipient:
// https://robinhoodchain.blockscout.com/address/0x2c3B1b6fe0EDa8e10C0445567b47e66E825B34cd?tab=contract
const FEE_ROUTER = "0x2c3B1b6fe0EDa8e10C0445567b47e66E825B34cd";
const BUYBACK_BURNER = "0xf6c7159e967f28c65d9fb5b919567e04540cd2ff";
const DEPLOYMENT_BLOCK = 50161538; // Beginning of the replacement deployment, 2026-08-30.
const WETH = ADDRESSES.robinhood.WETH;

// Published implementation source: https://robinhoodchain.blockscout.com/address/0xB35b85db23fEF3A146Fbd755D76be12F9e1eBfFC?tab=contract
const DISTRIBUTED = "event Distributed(address indexed caller, uint256 amountPulled, uint256 devAmount, uint256 protocolVaultAmount, uint256 protocolForwarded)";
const RECEIVER_SET = "event ProtocolReceiverSet(address indexed oldReceiver, address indexed newReceiver)";
const FEES = "Protocol Fee Distributions";
const DEVELOPER = "Developer Payments";
const BUYBACK = "Buyback Funding";
const TREASURY = "Treasury Payments";

const compareLogs = (a: PositionedLogArgs, b: PositionedLogArgs) =>
  a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const distributions = await getPositionedLogArgs(options, { target: FEE_ROUTER, eventAbi: DISTRIBUTED });
  const receiverChanges = await getPositionedLogArgs(options, {
    target: FEE_ROUTER,
    eventAbi: RECEIVER_SET,
    fromBlock: DEPLOYMENT_BLOCK,
    cacheInCloud: true, // Small, infrequently changing recipient configuration, not fee events.
    maxBlockRange: 10_000_000, // Public Robinhood RPC's maximum log-query span.
  });

  distributions.sort(compareLogs);
  receiverChanges.sort(compareLogs);
  let receiver = BUYBACK_BURNER;
  let changeIndex = 0;

  for (const log of distributions) {
    while (changeIndex < receiverChanges.length && compareLogs(receiverChanges[changeIndex], log) < 0) {
      const change = receiverChanges[changeIndex++];
      if (change.oldReceiver.toLowerCase() !== receiver)
        throw new Error("Abyss: incomplete protocol recipient history");
      receiver = change.newReceiver.toLowerCase();
    }

    const amount = BigInt(log.amountPulled);
    const developer = BigInt(log.devAmount);
    const protocol = BigInt(log.protocolVaultAmount);
    if (amount !== developer + protocol)
      throw new Error("Abyss: distribution does not reconcile");

    // This is the distributed protocol-fee slice, not gross trading fees or LP income.
    dailyFees.add(WETH, amount.toString(), FEES);
    dailyRevenue.add(WETH, developer.toString(), DEVELOPER);
    dailyProtocolRevenue.add(WETH, developer.toString(), DEVELOPER);
    const destination = receiver === BUYBACK_BURNER ? BUYBACK : TREASURY;
    dailyRevenue.add(WETH, protocol.toString(), destination);
    if (receiver === BUYBACK_BURNER)
      dailyHoldersRevenue.add(WETH, protocol.toString(), BUYBACK);
    else
      dailyProtocolRevenue.add(WETH, protocol.toString(), TREASURY);
    // protocolForwarded can include pre-existing router WETH; it is not additional fees.
    // Burner executions spend previously allocated funds and must not be counted again.
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-19", // First Distributed event: block 66817858, 2026-09-19 05:03:59 UTC.
  fetch,
  methodology: {
    Fees: "Protocol fees distributed in WETH on payment dates, with zero when there is no distribution; excludes LP fees, undistributed balances and in-kind ABYSS distributions.",
    Revenue: "The distributed protocol-fee share allocated to developers, treasury and ABYSS buybacks; excludes LP fees.",
    ProtocolRevenue: "WETH paid to developers and any protocol recipient other than the ABYSS buyback burner.",
    HoldersRevenue: "Fee-vault WETH allocated to the ABYSS buyback burner, measured at funding rather than execution; excludes pre-existing router balances.",
  },
  breakdownMethodology: {
    Fees: { [FEES]: "WETH pulled from the fee vault by the fee router, excluding LP fees and in-kind distributions." },
    Revenue: {
      [DEVELOPER]: "The emitted WETH developer allocation.",
      [BUYBACK]: "The emitted fee-vault WETH allocation to the ABYSS buyback burner.",
      [TREASURY]: "The emitted fee-vault WETH allocation when the protocol recipient is not the buyback burner.",
    },
    ProtocolRevenue: {
      [DEVELOPER]: "The emitted WETH developer allocation.",
      [TREASURY]: "The emitted fee-vault WETH allocation to a non-buyback protocol recipient.",
    },
    HoldersRevenue: { [BUYBACK]: "WETH allocated to ABYSS buybacks, counted once at the fee source, not again on execution." },
  },
};

export default adapter;
