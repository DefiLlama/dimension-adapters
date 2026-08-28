import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json"

const SHOWDOWN_CONTRACTS = {
    MONEYGAMES: "0x7B8DF4195eda5b193304eeCB5107DE18b6557D24",
    TOURNAMENTS: "0x130A8Da14C998C0fC23c5F5aDa64a318dFD6A805",
};

const USDM = ADDRESSES.megaeth.USDm;

const MATCHFUNDED_EVENT_ABI = "event MatchFunded(bytes16 indexed matchId, address indexed player1, address indexed player2, uint128 amount)";
const REGISTERED_EVENT_ABI = "event Registered(bytes16 indexed tournamentId, address indexed wallet, uint256 amount)";
const UNREGISTERED_EVENT_ABI = "event Unregistered(bytes16 indexed tournamentId, address indexed wallet, uint256 amount)";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const matchFundedLogs = await options.getLogs({
        target: SHOWDOWN_CONTRACTS.MONEYGAMES,
        eventAbi: MATCHFUNDED_EVENT_ABI,
    });

    const registeredLogs = await options.getLogs({
        target: SHOWDOWN_CONTRACTS.TOURNAMENTS,
        eventAbi: REGISTERED_EVENT_ABI,
    });

    const unregisteredLogs = await options.getLogs({
        target: SHOWDOWN_CONTRACTS.TOURNAMENTS,
        eventAbi: UNREGISTERED_EVENT_ABI,
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
    fetch,
    pullHourly: true,
    chains: [CHAIN.MEGAETH],
    start: "2026-02-03",
    methodology: {
        Volume: "Includes all Showdown money game deposits and net tournament registrations.",
    },
};

export default adapter;
