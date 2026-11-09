import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// ADEXTO (https://adexto.xyz) opens every market as one bonding curve that trades the token
// against the chain's native coin. The curve is the market's permanent venue: tokens never
// graduate or migrate, so all of a market's volume and fees happen on its own curve.
// Contracts: https://github.com/0xcuy/adexto/tree/main/contracts

// Every ADEXTO factory generation that has markets. All of them emit the same
// TrinityProjectDeployed signature (contracts/AdextoFactory.sol, "COMPATIBILITY"), and each address
// was checked on chain with VERSION(). Sources: "Mainnet deployments" in
// https://github.com/0xcuy/adexto/blob/main/README.md (1.0.0 and 0.11.0),
// https://github.com/0xcuy/adexto/blob/main/src/config/contracts.ts (0.12.0 and 0.10.0) and, per
// launch, https://github.com/0xcuy/adexto/blob/main/src/config/onchain-launches.json.
// `legacy` marks factory 0.10.0: its curves emit a ten-field Swap without a protocol leg. The 0.10.0
// factories on Base, Arbitrum and Monad have no markets (totalProjectsCount() = 0), so only 0G lists it.
// `fromBlock` is the block of the chain's first market, so no factory log can predate it.
type Factory = { address: string; legacy?: boolean };
const chainConfig: Record<string, { start: string; fromBlock: number; factories: Factory[] }> = {
  [CHAIN.OG]: {
    start: "2026-09-05",
    fromBlock: 43578117, // NOVA784, tx 0x36f4d78c9f9a35c92004465e7fb9d583dc74fa2de710cb6be9468d2f996fb2f3
    factories: [
      { address: "0xaA85bc0cceB35B524b6BB730612540Fb88df0f8e", legacy: true }, // 0.10.0
      { address: "0x51c4168226463F7e5A141e1c6D30520734BC840a" }, // 0.11.0
      { address: "0x06C80fD2d5d9365C20aC468c15874DBE748877e2" }, // 0.12.0
      { address: "0xEBbE0fB112859b57A0ad1afbeD4978e43dC96c5D" }, // 1.0.0
    ],
  },
  [CHAIN.MONAD]: {
    start: "2026-09-11",
    fromBlock: 103845897, // CURB, tx 0x743152ee89066a98e1b5cad500fe8d65f55255585d908f132a90b101985aadca
    factories: [
      { address: "0x5800e9715a47a598fce9bc3B65a95FD6BeBf76A3" }, // 0.11.0
      { address: "0xcA9c77f050CD1e0685b03D0236579966DA9B39B9" }, // 0.12.0
      { address: "0x3dFcBEd7dd889F465cC9f75c430B43Ef873b6056" }, // 1.0.0
    ],
  },
  [CHAIN.BASE]: {
    start: "2026-09-16",
    fromBlock: 51372549, // BLOOP, tx 0x06299c0c23f3c3fb0c74e9c5fbcbf1611fd3a4980d9a1ebb64d1c3378b173b55
    factories: [
      { address: "0x216E7880D64D94335B583c539802d3e61958d4A2" }, // 0.11.0
      { address: "0xe5B9555fbbcE72A5739dD29c3939A23fd230136F" }, // 0.12.0
      { address: "0xF5f904ca7763Fc6755bbCe5466a9DBd4C15c2708" }, // 1.0.0
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2026-09-16",
    fromBlock: 505650908, // WOMBO, tx 0x868aee2e6632a437b0b58a3ed1556091a0e658de0071420644726fe60479f362
    factories: [
      { address: "0xE17f1027FC5f294327D701829baeD9d6519e922C" }, // 0.11.0
      { address: "0x75EeDEd196D2BE283d815D52F617eB70bCe865bC" }, // 0.12.0
      { address: "0x79DF3671e7e7456832C84a34c2bC0DB7871C0E0E" }, // 1.0.0
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-10-01",
    fromBlock: 77064241, // SAI, tx 0xe05bc1fb93ba902ff6a15b36e80aa804609ab4e6c1780a0a6bcec8723286f38e
    factories: [
      { address: "0x8e63e117E71A80Cfc10fDF375F079e2e29cd7D7D" }, // 1.0.0, the only generation on Robinhood Chain
    ],
  },
};

// Wallets operated by the ADEXTO team: the deployer, the demo agent, the x402 relayer and the
// protocol treasury. Their swaps are demos and tests, so they are left out of volume and fees.
// The relayer only ever buys on behalf of an x402 payer, and a buy is attributed to the wallet
// that receives the tokens, so a relayed purchase by an outside payer still counts.
const TEAM_WALLETS = new Set(
  [
    "0x8a3c7524Aaed081825aC88eC7f4cCECFc583ee7D", // deployer, creator of the 0.10.0 and 0.11.0 markets
    "0x42478Ed9A429eC320d243469Fa5d6595BCc8daa5", // demo agent, creator of the SAI markets
    "0xDe1f5e5505c01aC6C847146fF76E0e067A49C627", // x402 relayer
    "0x24268Fffc119ec5550F68e80D94476fD64daE967", // protocol treasury
  ].map((address) => address.toLowerCase())
);

const DEPLOYED_EVENT =
  "event TrinityProjectDeployed(address indexed token, address indexed curve, address indexed creator, string name, string symbol, uint256 initialSupply, uint256 curveTokens, uint256 virtualNative, uint256 depthFeeBps, uint256 creatorFeeBps, uint256 treasuryBuybackBps, bytes32 metadataRoot)";
// Every swap carries its fee legs, all in the native coin. A buy's amountIn is the native paid
// including fees; a sell's amountOut is the native received after fees.
const SWAP_EVENT =
  "event Swap(address indexed trader, address indexed recipient, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 depthFee, uint256 creatorFee, uint256 treasuryFee, uint256 protocolFee, uint256 nativeReserveAfter, uint256 tokenReserveAfter)";
// Factory 0.10.0 curves: the same fields without the protocol leg.
const LEGACY_SWAP_EVENT =
  "event Swap(address indexed trader, address indexed recipient, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 depthFee, uint256 creatorFee, uint256 treasuryFee, uint256 nativeReserveAfter, uint256 tokenReserveAfter)";

const LABELS = {
  ToCreators: "Swap Fees To Creators",
  ToCurveReserves: "Swap Fees To Curve Reserves",
  ToBuybacks: "Swap Fees To Token Buyback And Burn",
  ToProtocol: "Swap Fees To Protocol",
};

const fetch = async (options: FetchOptions) => {
  const { factories, fromBlock } = chainConfig[options.chain];
  const toBlock = await options.getToBlock();
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addSwaps = async (targets: string[], eventAbi: string) => {
    if (!targets.length) return;
    const launches = await options.getLogs({ targets, eventAbi: DEPLOYED_EVENT, fromBlock, toBlock, cacheInCloud: true });
    const curves = launches.map((launch: any) => launch.curve);
    if (!curves.length) return;

    const swaps = await options.getLogs({ targets: curves, eventAbi });
    for (const swap of swaps) {
      const maker = String(swap.isBuy ? swap.recipient : swap.trader).toLowerCase();
      if (TEAM_WALLETS.has(maker)) continue;

      const depthFee = BigInt(swap.depthFee);
      const creatorFee = BigInt(swap.creatorFee);
      const treasuryFee = BigInt(swap.treasuryFee);
      const protocolFee = swap.protocolFee === undefined ? 0n : BigInt(swap.protocolFee);
      const fees = depthFee + creatorFee + treasuryFee + protocolFee;
      // Gross of fees on both sides, the same basis as the curve's own totalVolumeNative.
      const volume = swap.isBuy ? BigInt(swap.amountIn) : BigInt(swap.amountOut) + fees;

      dailyVolume.addGasToken(volume);
      dailyFees.addGasToken(fees, METRIC.SWAP_FEES);
      dailySupplySideRevenue.addGasToken(creatorFee, LABELS.ToCreators);
      dailySupplySideRevenue.addGasToken(depthFee, LABELS.ToCurveReserves);
      dailySupplySideRevenue.addGasToken(treasuryFee, LABELS.ToBuybacks);
      dailyRevenue.addGasToken(protocolFee, LABELS.ToProtocol);
    }
  };

  await addSwaps(factories.filter((f) => !f.legacy).map((f) => f.address), SWAP_EVENT);
  await addSwaps(factories.filter((f) => f.legacy).map((f) => f.address), LEGACY_SWAP_EVENT);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Native coin paid on buys and received on sells on ADEXTO bonding curves, gross of fees. Trades by the ADEXTO team's own wallets are excluded.",
  Fees: "All swap fees paid by traders on ADEXTO bonding curves, read from each Swap event: the creator, curve reserve, buyback and protocol legs. Rates are set per market at launch and never change; the launch presets are 1.00% on factory 1.0.0 and 0.12.0 markets and 0.40% on factory 0.11.0 markets.",
  UserFees: "All swap fees paid by traders.",
  Revenue: "The protocol leg of every swap, paid to the ADEXTO protocol treasury: 0.10% of the trade on factory 0.11.0, 0.12.0 and 1.0.0 markets, where it is a factory constant. Factory 0.10.0 markets have no protocol leg.",
  ProtocolRevenue: "The protocol leg of every swap, paid to the ADEXTO protocol treasury: 0.10% of the trade on factory 0.11.0, 0.12.0 and 1.0.0 markets, where it is a factory constant. Factory 0.10.0 markets have no protocol leg.",
  SupplySideRevenue: "The creator leg paid to each market's creator, the reserve leg that stays in the market's curve, and the buyback leg that buys and burns the market's own token.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid on ADEXTO bonding curves, read from the fee legs every Swap event carries.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on ADEXTO bonding curves.",
  },
  Revenue: {
    [LABELS.ToProtocol]: "The protocol leg, accrued on each curve and claimable only to the immutable ADEXTO protocol treasury.",
  },
  ProtocolRevenue: {
    [LABELS.ToProtocol]: "The protocol leg, accrued on each curve and claimable only to the immutable ADEXTO protocol treasury.",
  },
  SupplySideRevenue: {
    [LABELS.ToCreators]: "The creator leg, claimable only to the market's immutable creator. Launch presets: 0.70% of each trade on factory 1.0.0 and 0.12.0 markets, 0.10% on factory 0.11.0 markets; actual amounts are read from each Swap event.",
    [LABELS.ToCurveReserves]: "The depth leg, which stays in the market's curve reserve and raises its price floor.",
    [LABELS.ToBuybacks]: "The buyback leg, spent only on buying and burning the market's own token.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
