import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FEE_RECIPIENT = "0x79Af6AbA700CCe35f5Ad5573a679674593fC6f0C";
const DEFAULT_VOLUME_MULTIPLIER = 5_000;
const AVLT_VOLUME_MULTIPLIER = 1_000;
const AVLT_BY_CHAIN: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x74dB7a52773A52699dbC0c01b1254E5301E3e119",
  [CHAIN.HYPERLIQUID]: "0xd0Ee0CF300DFB598270cd7F4D0c6E0D8F6e13f29",
};
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";

const getVolumeMultiplier = (chain: string, token: string) =>
  token.toLowerCase() === AVLT_BY_CHAIN[chain]?.toLowerCase()
    ? AVLT_VOLUME_MULTIPLIER
    : DEFAULT_VOLUME_MULTIPLIER;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const recipientTopic = ethers.zeroPadValue(FEE_RECIPIENT, 32);

  // Fees can be paid in any ERC-20, so query all token contracts by recipient.
  const transferLogs = await options.getLogs({
    topics: [TRANSFER_TOPIC, null as any, recipientTopic],
    noTarget: true,
    eventAbi: TRANSFER_EVENT,
    entireLog: true,
  });

  for (const log of transferLogs) {
    if (!log.address || !log.data || log.data === "0x") continue;
    const amount = BigInt(log.data);
    if (amount <= 0n) continue;

    dailyFees.add(log.address, amount, METRIC.SWAP_FEES);
    const multiplier = getVolumeMultiplier(options.chain, log.address);
    dailyVolume.add(log.address, amount * BigInt(multiplier));
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "Swap volume is back-calculated from fees received by the Yieldzio fee wallet. The standard fees use a 0.02% rate ($1 per $5,000). AVLT fees on Ethereum and HyperEVM use a 0.1% rate ($1 of fees per $1,000 of volume) due to the majority of the AVLT volume coming from the liquidation service which charges a 10bps fee.",
  Fees: "All ERC-20 payments (0.1% swap fees on AVLT volume, 0.02% on other volume) received by the Yieldzio fee wallet are counted as fees.",
  UserFees:
    "Yieldzio charges 0.1% (10 bps) on AVLT volume on Ethereum and HyperEVM, and 0.02% (2 bps) on other volume.",
  Revenue: "100% of fees (0.1% swap fees on AVLT volume, 0.02% on other volume) received by the fee wallet are protocol revenue.",
  ProtocolRevenue: "100% of fees (0.1% swap fees on AVLT volume, 0.02% on other volume) received by the fee wallet are protocol revenue.",
};

const commonBreakdown = {
  [METRIC.SWAP_FEES]: "Yieldzio charges 0.1% (10 bps) on AVLT volume on Ethereum and HyperEVM, and 0.02% (2 bps) on other volume.",
}

const breakdownMethodology = {
  Fees: commonBreakdown,
  UserFees: commonBreakdown,
  Revenue: commonBreakdown,
  ProtocolRevenue: commonBreakdown,
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-02-01",
  chains: [CHAIN.ETHEREUM, CHAIN.HYPERLIQUID, CHAIN.PLASMA, CHAIN.MONAD, CHAIN.ARBITRUM, CHAIN.OPTIMISM, CHAIN.MEGAETH],
  methodology,
  breakdownMethodology,
};

export default adapter;
