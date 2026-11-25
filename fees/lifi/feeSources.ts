import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { fetchTransfersFromLIFIAPI, LifiDiamonds, LifiTransfer } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getTransaction } from "../../helpers/solana";

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
  // deployments/arc.json history: core setup #1846, v2.0.0 #2226 (2026-08-21), v2.1.0 #2611 (2026-11-04)
  [CHAIN.ARC]: ['0x8d01799a781A56377983E119c92036140F6D4d6f', '0xEDff4051B8286d2333149429F019dC10E23570da', '0x906A51f3d8dF12B7030D5299D1098dd89fFe830b'],
  [CHAIN.BERACHAIN]: ['0xc431Ee11b784960CF6ed6a69f91B93fB565b4d44', '0x135566E8702A377D3F7Ec9f0a2bD8009901E8693', '0x4A94f07E5e44CC5873221D3f157Eaaa9c1012f1C'],
  [CHAIN.ERA]: ['0xA577ddDa8E06BE1a0705fE9c6e6Ce2D2011100c9', '0x92870bEd7554532ddE5213aC0f304573D79AaB24', '0x24A72DD17De0f92dA5460c46CC2948e3a5cB755d'],
  [CHAIN.FUSE]: ['0x79C3F5B651Ee5782Ba15d968B088458cd5f1f4EF', '0x315042693AC6007EFF9ca86989cCd6160A2515b8'],
  [CHAIN.HEMI]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E', '0x735cCB84BCdeABF820c69adA959f7C7C41F54f86'],
  // 0xb85d6B3d: HyperEVM FeeForwarder until lifinance/contracts#2226 (2026-08-21).
  [CHAIN.HYPERLIQUID]: ['0xb85d6B3deDc688C2aC7C71669F20Fdd1eC739e97', '0xba072Bf218314E51d5c3d254800d799840ae6a25', '0x960413AF34CF1e428E9A157Cd4aABab78134d865'],
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

// LI.FI API fee names on Solana; the other feeCosts belong to the bridges
const SolanaFeeNames = ['LIFI Fee', 'LIFI Fixed Fee', 'LIFI Shared Fee'];
// LI.FI's fee wallet on Solana, as listed in fees/jumper-exchange
const SolanaFeeWallet = '34FKjAdVcTax2DHqV2XnbXa9J3zmyKcFuFKWbcmgxjgm';
const SolanaNative = '11111111111111111111111111111111';
// 'LIFI Fee' legs list only LI.FI's own amount. The integrator is paid by the next transfer in the same token,
// unless that transfer is the amount being bridged (more than half of the amount sent) or goes back to a signer.
const getSolanaIntegratorFee = async (signature: string, token: string, sending: LifiTransfer['sending']): Promise<bigint> => {
  const transaction: any = await getTransaction({ signature, encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 });
  if (!transaction?.meta) throw new Error(`lifi: solana rpc returned no transaction ${signature}`);
  const accounts = transaction.transaction.message.accountKeys.map((key: any) => key.pubkey);
  const signers = transaction.transaction.message.accountKeys.filter((key: any) => key.signer).map((key: any) => key.pubkey);
  const tokenAccounts = new Map<string, any>([...(transaction.meta.preTokenBalances ?? []), ...(transaction.meta.postTokenBalances ?? [])]
    .map((balance: any) => [accounts[balance.accountIndex], balance]));
  // LI.FI's transfer is a plain instruction, or one inside a program call: look in the list it sits in
  const lists: any[][] = [transaction.transaction.message.instructions, ...(transaction.meta.innerInstructions ?? []).map((inner: any) => inner.instructions)];
  for (const list of lists) {
    const transfers = list
      .filter((instruction: any) => ['transfer', 'transferChecked', 'transferCheckedWithFee'].includes(instruction.parsed?.type))
      .map(({ parsed: { info } }: any) => info.lamports !== undefined
        ? { to: info.destination, mint: SolanaNative, amount: BigInt(info.lamports) }
        : {
          to: tokenAccounts.get(info.destination)?.owner,
          mint: info.mint ?? tokenAccounts.get(info.destination)?.mint,
          amount: BigInt(info.amount ?? info.tokenAmount.amount),
        });
    const index = transfers.findIndex((transfer: any) => transfer.to === SolanaFeeWallet && transfer.mint === token);
    if (index < 0) continue;
    const next = transfers[index + 1];
    const isDeposit = next?.mint === sending.token.address && next.amount * 2n > BigInt(sending.amount);
    return next?.mint === token && !isDeposit && !signers.includes(next.to) ? next.amount : 0n;
  }
  throw new Error(`lifi: no LI.FI fee transfer in solana transaction ${signature}`);
};

export type SolanaFee = { token: string; integratorFee: string | bigint; lifiFee: string; integrator: string };

// LI.FI fees on bridges sent from Solana; refunded bridges report Solana as receiving chain
export const getSolanaBridgeFees = async (options: FetchOptions): Promise<SolanaFee[]> => {
  const transfers = await fetchTransfersFromLIFIAPI(options.startTimestamp, options.endTimestamp, [], CHAIN.SOLANA);
  const legs = [];
  for (const { sending, receiving, substatus, metadata, feeCosts } of transfers) {
    if (receiving.chainId === sending.chainId && substatus !== 'REFUNDED') continue;
    for (const { name, token, feeSplit } of feeCosts ?? []) {
      // legs without a split are not paid in the transaction
      if (!SolanaFeeNames.includes(name) || token.chainId !== sending.chainId || !feeSplit) continue;
      legs.push({ sending, integrator: metadata.integrator, name, token, feeSplit });
    }
  }
  const fees: SolanaFee[] = [];
  await PromisePool.withConcurrency(5).for(legs).handleError((error) => { throw error; }).process(async ({ sending, integrator, name, token, feeSplit }) => {
    const isListedByLifiOnly = name === 'LIFI Fee' && Number(feeSplit.integratorFee) === 0 && Number(feeSplit.lifiFee) > 0;
    const integratorFee = isListedByLifiOnly ? await getSolanaIntegratorFee(sending.txHash, token.address, sending) : feeSplit.integratorFee;
    fees.push({
      token: token.address === SolanaNative ? ADDRESSES.solana.SOL : token.address,
      integratorFee,
      lifiFee: feeSplit.lifiFee,
      integrator,
    });
  });
  return fees;
};
