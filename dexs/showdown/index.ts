import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json"
import { queryAllium } from "../../helpers/allium";
import { assertComplete, programEventsSql, u64 } from "../../helpers/alliumSolanaEvents";

// Showdown ran on MegaETH until 2026-06-01 (last MoneyGames log at block 17503497) and relaunched on Solana.
// MegaETH was only ever tracked for volume (its contracts are unverified), fees are tracked on Solana only.

const SHOWDOWN_CONTRACTS = {
    MONEYGAMES: "0x7B8DF4195eda5b193304eeCB5107DE18b6557D24",
    TOURNAMENTS: "0x130A8Da14C998C0fC23c5F5aDa64a318dFD6A805",
};

const USDM = ADDRESSES.megaeth.USDm;

const MATCHFUNDED_EVENT_ABI = "event MatchFunded(bytes16 indexed matchId, address indexed player1, address indexed player2, uint128 amount)";
const REGISTERED_EVENT_ABI = "event Registered(bytes16 indexed tournamentId, address indexed wallet, uint256 amount)";
const UNREGISTERED_EVENT_ABI = "event Unregistered(bytes16 indexed tournamentId, address indexed wallet, uint256 amount)";

const fetchMegaeth = async (options: FetchOptions) => {
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

const MONEY_MATCHES = "HaYXyyYKZDdom2khSh6xwkV7rFtEXfiS7GMZTEdPuWKo";
const TOURNAMENTS = "CZqTYLYYzLNGbivgkz4CDMEqHq9uajhrt5Ho5QTnF9Ei";

const MATCH_RESOLVED = { discriminator: "C33773F466D7DD28", size: 121 };
const TOURNAMENT_CLOSED = { discriminator: "F6899B59E2265708", size: 109 };

const fetchSolana = async (options: FetchOptions) => {
    const [row] = await queryAllium(`${programEventsSql([MONEY_MATCHES, TOURNAMENTS], options)},
  matches AS (
    SELECT SUM(2 * ${u64("data", 88)})::VARCHAR AS match_volume, SUM(2 * ${u64("data", 97)})::VARCHAR AS match_rake
    FROM program_events
    WHERE program = '${MONEY_MATCHES}' AND STARTSWITH(data, '${MATCH_RESOLVED.discriminator}') AND LENGTH(data) = ${2 * MATCH_RESOLVED.size}
  ),
  tournaments AS (
    SELECT SUM(${u64("data", 36)})::VARCHAR AS tournament_volume, SUM(${u64("data", 45)})::VARCHAR AS tournament_rake
    FROM program_events
    WHERE program = '${TOURNAMENTS}' AND STARTSWITH(data, '${TOURNAMENT_CLOSED.discriminator}') AND LENGTH(data) = ${2 * TOURNAMENT_CLOSED.size}
  )
  SELECT checks.*, matches.*, tournaments.*,
    (SELECT COUNT(*) FROM program_events
      WHERE (program = '${MONEY_MATCHES}' AND STARTSWITH(data, '${MATCH_RESOLVED.discriminator}') AND LENGTH(data) != ${2 * MATCH_RESOLVED.size})
        OR (program = '${TOURNAMENTS}' AND STARTSWITH(data, '${TOURNAMENT_CLOSED.discriminator}') AND LENGTH(data) != ${2 * TOURNAMENT_CLOSED.size})) AS unknown_layouts
  FROM checks, matches, tournaments`);
    assertComplete(row, "showdown", options);
    if (Number(row.unknown_layouts) > 0)
        throw new Error(`showdown: ${row.unknown_layouts} MatchResolved/TournamentClosed events with an unexpected size, their layout changed`);

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    dailyVolume.add(ADDRESSES.solana.USDC, row.match_volume ?? 0);
    dailyVolume.add(ADDRESSES.solana.USDC, row.tournament_volume ?? 0);
    dailyFees.add(ADDRESSES.solana.USDC, row.match_rake ?? 0, "Money Match Rake");
    dailyFees.add(ADDRESSES.solana.USDC, row.tournament_rake ?? 0, "Tournament Rake");

    return { dailyVolume, dailyFees };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        // Showdown moved to Solana, its last MegaETH match was funded on 2026-06-01
        [CHAIN.MEGAETH]: { fetch: fetchMegaeth, start: "2026-02-03", deadFrom: "2026-06-02" },
        [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-10-13" },
    },
    dependencies: [Dependencies.ALLIUM],
    // Rakeback and referral rewards are paid out of the rake outside the Showdown programs, so Showdown's share of
    // the rake cannot be read on-chain; revenue is left out rather than estimated
    skipBreakdownValidation: true,
    methodology: {
        Volume: "USDC staked by both players in money matches and tournament buy-ins. On MegaETH it was counted when matches were funded and players registered; on Solana when matches are resolved and tournaments closed, excluding sponsored prizes and the prize-pool top-ups Showdown pays to meet a tournament's guarantee.",
        Fees: "Rake Showdown takes from money match stakes and tournament buy-ins on Solana; fees from Showdown's earlier MegaETH deployment are not tracked.",
    },
    breakdownMethodology: {
        Fees: {
            "Money Match Rake": "Rake taken from both players' stakes when a money match is resolved.",
            "Tournament Rake": "Rake taken from the buy-ins when a tournament closes.",
        },
    },
};

export default adapter;
