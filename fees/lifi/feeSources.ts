import { FetchOptions } from "../../adapters/types";
import { LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";

export const FeeCollectedEvent = "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)";
export const FeesForwardedEvent = "event FeesForwarded(address indexed token, (address recipient, uint256 amount)[] fees)";
const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";
const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)";

// first Jumper fee payout on-chain: jumperadvanced 2026-08-07, jumperrwa 2026-08-24, jumper.exchange bridges 2026-09-03
// and swaps 2026-09-24. Fee schedule: https://github.com/lifinance/jumper-docs/blob/main/jumper-fees.mdx
export const JumperFeeStart = '2026-08-07';
// The recipient in every LI.FI payout on the 21 chains checked on 2026-07-23.
export const LifiRecipient = '0xc06ebbefd94032b85424d51906e2a335efae264b';

// https://github.com/lifinance/contracts/tree/main/deployments
// FeeCollector -> FeeRouter -> FeeForwarder migrations preserve their historical events.
const FeeRouters: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x685527c551cc40ce1f1c9818cd8683307076e4ed',
};
const DefaultFeeRouter = '0xc18d9e84b8687a2645447a61e52c455dac1675e1';
const FeeRouter2608 = '0xce40449b773a3e6e5e769adb4e567179d4828cbd';
// FeeForwarder v2.1.0 (lifinance/contracts#2611, 2026-11-04): replaces FeeRouter2608 on 21 chains, the others got the per-chain addresses below.
const FeeForwarder2611 = '0xde2b920506ee931a6a2abdf566526220214fbbae';

// https://github.com/lifinance/contracts/tree/main/deployments (FeeForwarder, last address is the v2.1.0 one from #2611)
const ChainFeeForwarders: Record<string, string[]> = {
  [CHAIN.ABSTRACT]: ['0xA577ddDa8E06BE1a0705fE9c6e6Ce2D2011100c9', '0x973Be760B2992D7F01f0d66bEb48A172d10FB79a', '0x24A72DD17De0f92dA5460c46CC2948e3a5cB755d'],
  [CHAIN.BERACHAIN]: ['0xc431Ee11b784960CF6ed6a69f91B93fB565b4d44', '0x135566E8702A377D3F7Ec9f0a2bD8009901E8693', '0x4A94f07E5e44CC5873221D3f157Eaaa9c1012f1C'],
  [CHAIN.ERA]: ['0xA577ddDa8E06BE1a0705fE9c6e6Ce2D2011100c9', '0x92870bEd7554532ddE5213aC0f304573D79AaB24', '0x24A72DD17De0f92dA5460c46CC2948e3a5cB755d'],
  [CHAIN.FUSE]: ['0x79C3F5B651Ee5782Ba15d968B088458cd5f1f4EF', '0x315042693AC6007EFF9ca86989cCd6160A2515b8'],
  [CHAIN.HEMI]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E', '0x735cCB84BCdeABF820c69adA959f7C7C41F54f86'],
  [CHAIN.HYPERLIQUID]: ['0xba072Bf218314E51d5c3d254800d799840ae6a25', '0x960413AF34CF1e428E9A157Cd4aABab78134d865'],
  [CHAIN.INK]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E', '0x735cCB84BCdeABF820c69adA959f7C7C41F54f86'],
  [CHAIN.KATANA]: ['0xaaa55A0157670Ff2b4CF82F5cd2C754FE54BA574', '0x51586Ff93Ded33DbEb6D5fA68d046Fd036251D8A', '0xEC51f3746626919d01a62563D9730804306898D1'],
  [CHAIN.LINEA]: ['0x72015d314542457cBB6BF14318d82464E4D413ec', '0xD8b700cEd3e486c3c4FC31Fc0c3b3590e1a52D7e', '0xd7C2Aa1BfD2Aa089D1a9e2b3ecd7cc0A6b268FcF'],
  [CHAIN.MANTLE]: ['0x79C3F5B651Ee5782Ba15d968B088458cd5f1f4EF', '0x315042693AC6007EFF9ca86989cCd6160A2515b8'],
  [CHAIN.METIS]: ['0xF46B6684DF5D121D5FDD6cA76Ef4919c65887083', '0x531207ED256C75d26401aEd744333265E4b9029c', '0xf39ba89EE7Cb552985E4b475060b825567bAa6bB'],
  [CHAIN.MONAD]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E', '0x735cCB84BCdeABF820c69adA959f7C7C41F54f86'],
  [CHAIN.PLUME]: ['0xa2D39966793873f4514E5EcBDB0e1a84cAffa650', '0x32ca3c43c2807EbB7d82212BeeC31c1b7BaaD146', '0x15583505386A1a952b8d515b6bF052134c3f14e0'],
  [CHAIN.ROBINHOOD]: ['0xF4BFFE4dfC693f37715A47c15BdA8af9ed8f7Cf1', '0x4e0eb4c17A2Fc64f06314aFa4d3646241784ab3a', '0xEf17eF207Fc9558F8Da5D32fBb94Ea6d4348f24F'],
  [CHAIN.SONEIUM]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E', '0x735cCB84BCdeABF820c69adA959f7C7C41F54f86'],
  [CHAIN.UNICHAIN]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E', '0x735cCB84BCdeABF820c69adA959f7C7C41F54f86'],
};

export const getFeeForwarders = (chain: string) => [...new Set([
  FeeRouters[chain] ?? DefaultFeeRouter,
  FeeRouter2608,
  FeeForwarder2611,
  ...(ChainFeeForwarders[chain] ?? []),
].map((address) => address.toLowerCase()))];

export type FeeTransaction = { integrators: Set<string>; kind: 'swap' | 'bridge' };

// integrator tags Jumper uses on its main app, gas refuel, Advanced and RWA products
export const JumperIntegrators = new Set(['jumper.exchange', 'jumper.exchange.gas', 'jumperadvanced', 'jumperrwa']);

export const isJumperTransaction = (transaction?: FeeTransaction) => transaction !== undefined &&
  transaction.integrators.size === 1 && JumperIntegrators.has([...transaction.integrators][0]);

export const getFeeTransactions = async (options: FetchOptions): Promise<Map<string, FeeTransaction>> => {
  const diamond = LifiDiamonds[options.chain]?.id;
  const transactions = new Map<string, FeeTransaction>();
  if (!/^0x[0-9a-f]{40}$/i.test(diamond ?? '')) return transactions;

  const swaps: any[] = await options.getLogs({ target: diamond, eventAbi: LifiSwapEvent, entireLog: true, maxBlockRange: 10000 });
  const bridges: any[] = await options.getLogs({ target: diamond, eventAbi: LifiBridgeEvent, entireLog: true, maxBlockRange: 10000 });
  for (const log of swaps) {
    const hash = String(log.transactionHash).toLowerCase();
    const transaction = transactions.get(hash) ?? { integrators: new Set<string>(), kind: 'swap' as const };
    transaction.integrators.add(log.args.integrator);
    transactions.set(hash, transaction);
  }
  for (const log of bridges) {
    const hash = String(log.transactionHash).toLowerCase();
    const transaction = transactions.get(hash) ?? { integrators: new Set<string>(), kind: 'bridge' as const };
    transaction.integrators.add(log.args.bridgeData.integrator);
    transaction.kind = 'bridge';
    transactions.set(hash, transaction);
  }
  return transactions;
};
