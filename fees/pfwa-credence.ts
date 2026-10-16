import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// Credence (https://credence.pfwa.fun, https://x.com/pfwafun), part of PFWA: a token deployer on Robinhood Chain. Every
// token it deploys (on the Pons launchpad) is tied to a live Polymarket prediction: the token's creator trading fees
// fund the bet, and winnings buy back and burn the token. Contracts are verified on Sourcify (chain 4663).
//
// Fee flows counted here, all on Robinhood Chain:
// - Creator trading fees. Each Credence token names its CredenceVault as its Pons creator-fee recipient. A v2 vault
//   collects them with collectFees() (FeesCollected, in WETH); a harvest then swaps 20% of the vault's WETH for $PFWA
//   that goes to the dead address (PFWA_SPLIT_BPS = 2000) and bridges 80% to the token's PolyVault on Polygon, where it
//   buys the outcome (Harvested). The two v1 vaults have no collection event, so their fees are counted when harvested
//   (same 20/80 split, PFWA_FEE_SPLIT_BPS = 2000).
// - Creator vault fees. Tokens launched for an X account through CreatorLauncher pay their Pons creator fees into that
//   account's CreatorFeeVault (Funded, in the token's pair asset). In the same call (_claimEscrow) the vault sends
//   amount * protocolBps / 10000 to the factory's protocolRecipient and holds the rest until the account claims it.
//   protocolBps is immutable in the factory, so the split is computed from each Funded event as it accrues.
// - Launch fees: the Credence fee each launcher charges on top of Pons' own launch fee (credenceFee / launchFee), kept
//   in the launcher until its owner withdraws it. The owner can change the fee (CredenceFeeSet / LaunchFeeSet); it is
//   read at the window's end block.
// Not fees: the bet's winnings coming home and the meme tokens they buy back and burn (they are the bet's outcome).
// The $PFWA buyback is counted at the fee source (20% of the creator fees as they are collected), not from the harvests:
// a harvest spends 20% of whatever WETH the vault holds, which can include WETH that is not fees (the v2 vaults have
// harvested 0.0125 WETH against 0.0105 WETH of fees collected).

const PFWA_SHARE_BPS = 2000n; // 20% of a token vault's creator fees buys and burns $PFWA (PFWA_FEE_SPLIT_BPS / PFWA_SPLIT_BPS)
const WETH = ADDRESSES.robinhood.WETH;

// firstVaultTimestamp: the time of the factory's first vault. Windows ending earlier skip it, since listing the vaults
// of a factory not deployed yet reverts. Gated on the first vault rather than the deployment because Robinhood
// block-by-timestamp lookups can be ~3 minutes off; every factory was deployed 50+ minutes before its first vault.
const VAULT_FACTORIES: { factory: string; kind: "v1" | "v2" | "creator"; firstVaultTimestamp: number }[] = [
  { factory: "0x17d0f24ADbD613C046eB25c0cc054333c5481F05", kind: "v1", firstVaultTimestamp: 1788756722 }, // CredenceVaultFactory, 2026-09-07 04:52:02 UTC, block 56562702
  { factory: "0x099684533Dc729457650AB2424811AF9c79032D8", kind: "v2", firstVaultTimestamp: 1789851952 }, // CredenceVaultFactoryV2, 2026-09-19 21:05:52 UTC, block 67391134 (deployed 19:59:45, block 67351602)
  { factory: "0xD9e709c55Ce2680B99E982Ce1AAb24890dD39D55", kind: "v2", firstVaultTimestamp: 1789752976 }, // v2 rehearsal factory, retired (one vault), 2026-09-18 17:36:16 UTC, block 66408469 (deployed 09-17 23:35:29, block 65764888)
  { factory: "0xade0E3e0218d53A89E607F312DB9CeA2DFcC5D10", kind: "creator", firstVaultTimestamp: 1790723752 }, // CreatorFeeVaultFactory, 2026-09-29 23:15:52 UTC, block 76043400 (deployed 20:14:58, block 75935164)
];
const EVENTS = {
  feesCollected: "event FeesCollected(uint256 weth)",
  harvested: "event Harvested(uint256 totalWeth, uint256 pfwaBurned, uint256 wethBridged)", // v1 CredenceVault
  funded: "event Funded(address indexed asset, address indexed from, uint256 amount)",
  launchedV1: "event TokenAndVaultLaunched(address indexed memeToken, address indexed vault, address indexed creator, address curve)",
  launchedV2: "event TokenAndVaultLaunched(address indexed memeToken, address indexed vault, address indexed creator, address curve, address polyVault)",
  creatorLaunched: "event CreatorTokenLaunched(address indexed token, address indexed vault, address indexed launcher, bytes32 idHash, address curve, address pairToken)",
};

// the retired rehearsal launcher (0x69CD45c4d89CA8Cfe37c2ED1F869306e031d58F9, one team rehearsal launch) is not counted.
// No start gate: a launcher is read through its logs (none before it is deployed) and, per launch, its fee.
const LAUNCHERS = [
  { launcher: "0xdF2eBF0bc156880BbE03d8eD330B2A2431d74019", feeAbi: "uint256:credenceFee", eventAbi: EVENTS.launchedV1 }, // CredenceDeployer (v1)
  { launcher: "0x6EF3e8b1291463434850fb6ED466858A043D8525", feeAbi: "uint256:credenceFee", eventAbi: EVENTS.launchedV2 }, // CredenceLauncherV2
  { launcher: "0x0903EB2fBccf7bF9eC86b4cb2894A7a9E5Adab5c", feeAbi: "uint256:launchFee", eventAbi: EVENTS.creatorLaunched }, // CreatorLauncher
];

const L = {
  CREATOR_FEES: "Creator Trading Fees",
  CREATOR_VAULT_FEES: "Creator Vault Fees",
  LAUNCH_FEES: "Launch Fees",
  CREATOR_FEES_TO_BUYBACK: "Creator Trading Fees To PFWA Buyback",
  CREATOR_FEES_TO_BETS: "Creator Trading Fees To Prediction Bets",
  CREATOR_VAULT_FEES_TO_PROTOCOL: "Creator Vault Fees To Protocol",
  CREATOR_VAULT_FEES_TO_CREATORS: "Creator Vault Fees To Creators",
  LAUNCH_FEES_TO_PROTOCOL: "Launch Fees To Protocol",
  BUYBACK: "PFWA Buyback And Burn",
};

type Uint = bigint | string | number;

const assetKey = (asset: string) => (asset.toLowerCase() === ADDRESSES.null ? ADDRESSES.null : asset);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const factories = VAULT_FACTORIES.filter(({ firstVaultTimestamp }) => options.toTimestamp >= firstVaultTimestamp);
  const counts = await options.api.multiCall({ abi: "uint256:vaultCount", calls: factories.map(({ factory }) => factory) });
  const slots = factories.flatMap(({ factory, kind }, i) => Array.from({ length: Number(counts[i]) }, (_, id) => ({ factory, kind, id })));
  const vaults: string[] = await options.api.multiCall({
    abi: "function allVaults(uint256) view returns (address)",
    calls: slots.map(({ factory, id }) => ({ target: factory, params: [id] })),
  });
  const vaultsOf = (kind: string) => vaults.filter((_, j) => slots[j].kind === kind);
  const logsOf = async <A>(targets: string[], eventAbi: string): Promise<A[]> => (targets.length ? options.getLogs({ targets, eventAbi }) : []);

  const [collectedV2, harvestedV1, funded, launches] = await Promise.all([
    logsOf<{ weth: Uint }>(vaultsOf("v2"), EVENTS.feesCollected),
    logsOf<{ totalWeth: Uint }>(vaultsOf("v1"), EVENTS.harvested),
    logsOf<{ asset: string; from: string; amount: Uint }>(vaultsOf("creator"), EVENTS.funded),
    Promise.all(LAUNCHERS.map(({ launcher, eventAbi }): Promise<unknown[]> => options.getLogs({ target: launcher, eventAbi }))),
  ]);

  const addCreatorFees = (weth: bigint) => {
    const toBuyback = (weth * PFWA_SHARE_BPS) / 10000n;
    dailyFees.add(WETH, weth, L.CREATOR_FEES);
    dailyRevenue.add(WETH, toBuyback, L.CREATOR_FEES_TO_BUYBACK);
    dailyHoldersRevenue.add(WETH, toBuyback, L.BUYBACK);
    dailySupplySideRevenue.add(WETH, weth - toBuyback, L.CREATOR_FEES_TO_BETS);
  };

  // v2 vaults: creator fees when collected from Pons
  for (const log of collectedV2) addCreatorFees(BigInt(log.weth));

  // v1 vaults: creator fees when harvested
  for (const log of harvestedV1) addCreatorFees(BigInt(log.totalWeth));

  // creator vaults: each Pons creator-fee arrival for an X account, split as it accrues into the protocol's cut and
  // the account's share, exactly as _claimEscrow does in the same call
  if (funded.length) {
    const creatorFactory = factories.find(({ kind }) => kind === "creator")!.factory;
    const protocolBps = BigInt(await options.api.call({ target: creatorFactory, abi: "uint16:protocolBps" }));
    for (const log of funded) {
      const amount = BigInt(log.amount);
      const toProtocol = (amount * protocolBps) / 10000n;
      dailyFees.add(assetKey(log.asset), amount, L.CREATOR_VAULT_FEES);
      dailyRevenue.add(assetKey(log.asset), toProtocol, L.CREATOR_VAULT_FEES_TO_PROTOCOL);
      dailyProtocolRevenue.add(assetKey(log.asset), toProtocol, L.CREATOR_VAULT_FEES_TO_PROTOCOL);
      dailySupplySideRevenue.add(assetKey(log.asset), amount - toProtocol, L.CREATOR_VAULT_FEES_TO_CREATORS);
    }
  }

  // launch fees: one Credence fee per launch, at the launcher's fee read at the window's end block. The owner can change
  // it, but it has changed once since launch (CredenceLauncherV2: 0.0005 to 0.0015 ETH on 2026-09-20 18:15 UTC, with no
  // launch in that hour), so it is not read at each launch's block.
  let launchFees = 0n;
  for (let i = 0; i < LAUNCHERS.length; i++) {
    if (!launches[i].length) continue;
    const fee: Uint = await options.api.call({ target: LAUNCHERS[i].launcher, abi: LAUNCHERS[i].feeAbi });
    launchFees += BigInt(fee) * BigInt(launches[i].length);
  }
  if (launchFees > 0n) {
    dailyFees.addGasToken(launchFees, L.LAUNCH_FEES);
    dailyRevenue.addGasToken(launchFees, L.LAUNCH_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.addGasToken(launchFees, L.LAUNCH_FEES_TO_PROTOCOL);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Creator trading fees that Pons pays to Credence vaults for the tokens Credence deployed, creator fees paid into creator vaults for X accounts, and the Credence fee charged on every launch.",
  UserFees: "Creator trading fees paid by traders of Credence tokens on Pons, and the Credence fee paid by token creators at launch.",
  Revenue: "What Credence keeps: 20% of each token vault's creator fees, which buys back and burns $PFWA, the protocol's cut of creator vault fees, and launch fees.",
  ProtocolRevenue: "Revenue sent to the Credence Safe: the protocol's cut of creator vault fees and the launch fees.",
  HoldersRevenue: "The 20% of each token vault's creator fees that is spent buying $PFWA sent to the dead address, counted when the fees are collected.",
  SupplySideRevenue: "80% of each token vault's creator fees, bridged to Polygon to fund the token's Polymarket bet (whose winnings buy back and burn the token), and the creator vault fees held for the X account they belong to.",
};

const breakdownMethodology = {
  Fees: {
    [L.CREATOR_FEES]: "Pons creator trading fees collected by a Credence token's vault (v2 vaults when collected, v1 vaults when harvested), in WETH.",
    [L.CREATOR_VAULT_FEES]: "Pons creator trading fees paid into a CreatorFeeVault for the X account a token was launched for, in the token's pair asset.",
    [L.LAUNCH_FEES]: "The Credence fee each launch pays on top of Pons' own launch fee.",
  },
  UserFees: {
    [L.CREATOR_FEES]: "Creator trading fees paid by traders of Credence tokens on Pons.",
    [L.CREATOR_VAULT_FEES]: "Creator trading fees paid by traders of creator-vault tokens on Pons.",
    [L.LAUNCH_FEES]: "The Credence fee paid by the token's creator at launch.",
  },
  Revenue: {
    [L.CREATOR_FEES_TO_BUYBACK]: "20% of a token vault's creator fees, which the harvest spends buying back and burning $PFWA.",
    [L.CREATOR_VAULT_FEES_TO_PROTOCOL]: "The protocol's cut of each creator vault fee arrival (protocolBps, 10%), sent to the Credence Safe in the same transaction.",
    [L.LAUNCH_FEES_TO_PROTOCOL]: "Launch fees, withdrawn from the launchers by the Credence Safe.",
  },
  ProtocolRevenue: {
    [L.CREATOR_VAULT_FEES_TO_PROTOCOL]: "The protocol's cut of each creator vault fee arrival (protocolBps, 10%).",
    [L.LAUNCH_FEES_TO_PROTOCOL]: "Launch fees, withdrawn from the launchers by the Credence Safe.",
  },
  HoldersRevenue: {
    [L.BUYBACK]: "20% of a token vault's creator fees, which the next harvest swaps for $PFWA on the 1% WETH/PFWA Uniswap v3 pool and sends to the dead address.",
  },
  SupplySideRevenue: {
    [L.CREATOR_FEES_TO_BETS]: "80% of a token vault's creator fees, bridged to the token's PolyVault on Polygon to buy its Polymarket outcome; winnings buy back and burn the token.",
    [L.CREATOR_VAULT_FEES_TO_CREATORS]: "Creator vault fees after the protocol's cut, held for the X account until it claims them.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-07",
  methodology,
  breakdownMethodology,
};

export default adapter;
