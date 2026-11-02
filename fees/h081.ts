import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * H081 Capital (https://h081.xyz): a private bank for AI agents on Solana. Live on Solana mainnet,
 * not audited yet.
 *
 * The protocol has two fee sources, both paid in USDG into the treasury's USDG token account:
 *  - relay fee: 0.20% of the public amount of every relayed withdrawal / spend (paid by the user's
 *    proof, transferred out of the bank vault FaRG7DV8e7XF3RyoZrBb3h1oLiFFWFFCuYDSXsDoyyzG by the
 *    stipend_pool program; the transaction is signed by the relayer hot wallet);
 *  - loan origination fee: 0.25% of the principal of every funded loan (stream_loan::fund, a
 *    compile-time constant, deducted from the lender's payout and sent from the lender's own token
 *    account; the transaction is signed by the lender).
 * 100% of both goes to the protocol treasury (a Squads multisig vault), so revenue = fees.
 *
 * The treasury's USDG token account is fee-only: the protocol sends nothing else to it and the team
 * never tops it up from an unlisted wallet. Every wallet the team controls (deployer, config
 * authority, the Squads multisig and its members, the relayer hot wallet) is
 * excluded as a sender below, and every wallet that could sign a team transfer is excluded as a
 * signer; the relayer hot wallet is excluded as a sender only, because it signs the relay-fee
 * transactions (the fee itself comes from the vault, not from the hot wallet).
 *
 * Known limit of the "received by the treasury" method: a USDG transfer from an unrelated third
 * party (a donation) would be counted. The protocol has no such inflow path; the owner guide
 * commits the team to never funding the treasury's USDG account from a wallet that is not listed.
 *
 * H081 token trading / creator fees are NOT protocol fees and are excluded: they never reach the
 * treasury, the H081 mint is blacklisted, and transfers signed by or sent from the team's wallets
 * are filtered out below.
 */

// Protocol treasury (Squads v4 vault) and its USDG associated token account (Token-2022)
const TREASURY = "EGvxic665gsar6K3YsnuUH4qPTnv1Rb2rMu2F3GpkZGq";
const TREASURY_USDG_ATA = "DxpmCZYAoDKpHmA5vWuopUrf3UVuGnPvditVrN9xDwDo";
// USDG (Token-2022, 6 decimals): the only deposit and fee asset today. stream_loan charges the
// origination fee in the loan's asset, so a new loan asset needs to be added here (see the owner guide).
const USDG = "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH";
// H081 protocol token: never a fee asset (trading / creator fees are not protocol revenue)
const H081 = "EgqxxR7zowzaLEm24oep5qqBieLVAWYX78LhgeqAJAo";

// Team wallets: transfers from them (top-ups, tests) or signed by them are not fees.
const DEPLOYER = "5WCpirBe1wHUk6PL2nU97pj87PtyaqH9S6UJUbd5z2W1"; // deployer / upgrade authority
const CONFIG_AUTHORITY = "4eySgHKMNGMpWtbtpfxfSyJZK8LGYxEZLzJwHXCsoPX2"; // stipend_pool config authority
// Treasury multisig (Squads v4): the multisig account, its create key and the current members
const TREASURY_MULTISIG = [
  "G3xFLKe6An28bgdtUuyaoZCpjtPpQTh3GgKNKtWG26A6", // multisig
  "4ir9vPVqWZ28ja6eTZs75LqBduhL1R8AQ9irxBu16kAd", // create key
  "3QxDPawgSmdPsvNa1xfsHuuF7cXWBaoBhPHgQgoBpnfi", // member 1
  "3TGGDFAtipTMSpkmSEfm1CTcREQYdTkzWhzdVCzLLa7N", // member 2
  "7815bY95r1E5FifAZMf5rM5Vjrper67BBY1wS8m216i1", // member 3
];
// Relayer hot wallet: pays transaction fees and SIGNS every relayed withdrawal / spend, so it must
// not be a blacklisted signer; it never holds protocol fees, so anything it sends is not a fee.
const RELAYER_HOT_WALLET = "DWp7dJ6QZxqtUDhMy7JB6UJru47J94bQSJNEdG4QrjjA";

const INTERNAL = [TREASURY, TREASURY_USDG_ATA, DEPLOYER, CONFIG_AUTHORITY, ...TREASURY_MULTISIG];
const BLACKLIST_FROM = [...INTERNAL, RELAYER_HOT_WALLET];
const BLACKLIST_SIGNERS = INTERNAL;

const LABEL_FEES = METRIC.PROTOCOL_FEES;

async function fetch(options: FetchOptions) {
  const received = options.createBalances();
  await getSolanaReceived({
    options,
    balances: received,
    targets: [TREASURY, TREASURY_USDG_ATA],
    mints: [USDG],
    blacklist_mints: [H081],
    blacklists: BLACKLIST_FROM,
    blacklist_signers: BLACKLIST_SIGNERS,
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, LABEL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Fees:
    "USDG received by the H081 protocol treasury's fee-only USDG account: the 0.20% relay fee on relayed withdrawals and spends (sent out of the bank vault by the stipend_pool program) plus the 0.25% loan origination fee on funded loans (sent by the lender in stream_loan::fund). " +
    "The treasury's USDG account receives nothing else from the protocol; transfers from or signed by the team's wallets (deployer, config authority, treasury multisig and its members, relayer hot wallet) are excluded. " +
    "H081 token trading and creator fees are not protocol fees and are not counted (the H081 mint is excluded).",
  Revenue:
    "Same as Fees: 100% of the relay and origination fees go to the protocol treasury; there is no supply-side share.",
  ProtocolRevenue:
    "Same as Revenue: all fees are kept by the protocol treasury (a Squads multisig vault).",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_FEES]: "0.20% relay fee on relayed withdrawals / spends and 0.25% loan origination fee, both paid in USDG to the treasury's fee-only USDG account.",
  },
  Revenue: {
    [LABEL_FEES]: "100% of the relay and origination fees, kept by the protocol treasury.",
  },
  ProtocolRevenue: {
    [LABEL_FEES]: "100% of the relay and origination fees, kept by the protocol treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-31",
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
