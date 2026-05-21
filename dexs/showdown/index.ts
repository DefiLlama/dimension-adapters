import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SHOWDOWN_CONTRACTS = {
  MONEYGAMES: { address: "0x7B8DF4195eda5b193304eeCB5107DE18b6557D24", fromBlock: 6238852, },
  TOURNAMENTS: { address: "0x130A8Da14C998C0fC23c5F5aDa64a318dFD6A805", fromBlock: 11578822, },
};

const USDM = "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7";
const LOG_CHUNK_SIZE = 100_000;

const MATCHFUNDED_EVENT_ABI = "event MatchFunded(bytes16 indexed matchId, address indexed player1, address indexed player2, uint128 amount)";
const REGISTERED_EVENT_ABI = "event Registered(bytes16 indexed tournamentId, address indexed wallet, uint256 amount)";
const UNREGISTERED_EVENT_ABI = "event Unregistered(bytes16 indexed tournamentId, address indexed wallet, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const fromBlockWindow = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const showdownStartBlock = Math.min(SHOWDOWN_CONTRACTS.MONEYGAMES.fromBlock, SHOWDOWN_CONTRACTS.TOURNAMENTS.fromBlock);
  const effectiveFromBlock = Math.max(showdownStartBlock, fromBlockWindow);
  if (toBlock - effectiveFromBlock > LOG_CHUNK_SIZE) {
    throw new Error(`Showdown DEX fetch window too large: ${toBlock - effectiveFromBlock} blocks (max ${LOG_CHUNK_SIZE})`);
  }

  const matchFundedLogs = await options.getLogs({
    target: SHOWDOWN_CONTRACTS.MONEYGAMES.address,
    eventAbi: MATCHFUNDED_EVENT_ABI,
    fromBlock: Math.max(SHOWDOWN_CONTRACTS.MONEYGAMES.fromBlock, fromBlockWindow),
    toBlock,
  });
  const registeredLogs = await options.getLogs({
    target: SHOWDOWN_CONTRACTS.TOURNAMENTS.address,
    eventAbi: REGISTERED_EVENT_ABI,
    fromBlock: Math.max(SHOWDOWN_CONTRACTS.TOURNAMENTS.fromBlock, fromBlockWindow),
    toBlock,
  });
  const unregisteredLogs = await options.getLogs({
    target: SHOWDOWN_CONTRACTS.TOURNAMENTS.address,
    eventAbi: UNREGISTERED_EVENT_ABI,
    fromBlock: Math.max(SHOWDOWN_CONTRACTS.TOURNAMENTS.fromBlock, fromBlockWindow),
    toBlock,
  });

  matchFundedLogs.forEach((log: any) => {
    // MatchFunded amount applies to both players in the match.
    dailyVolume.add(USDM, BigInt(log.amount) * 2n);
  });
  registeredLogs.forEach((log: any) => dailyVolume.add(USDM, log.amount));
  unregisteredLogs.forEach((log: any) => dailyVolume.add(USDM, -log.amount));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-03",
  methodology: {
    Volume: "Includes all Showdown money game deposits and net tournament registrations.",
  },
  fetch,
};

export default adapter;
