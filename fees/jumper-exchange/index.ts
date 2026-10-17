import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { fetchTransfersFromLIFIAPI, LIFI_API_CHAINS, LIFI_UNSUPPORTED_CHAINS, LifiDiamonds, LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists";
import { FeesForwardedEvent, getFeeForwarders, getFeeTransactions, isJumperTransaction, JumperFeeStart, JumperIntegrators } from "../lifi/feeSources";

const SwapFee = 'Swap Fees';
const BridgeFee = 'Bridge Fees';

// FeesForwarded logs; X Layer skipped (RPCs reject the log scan, no Jumper fees seen)
const OnchainChains = [...Object.keys(LifiFeeCollectors), CHAIN.HYPERLIQUID]
  .filter((chain) => /^0x[0-9a-f]{40}$/i.test(LifiDiamonds[chain]?.id ?? ''));

// LI.FI API 'LIFI Fixed Fee' leg, equal to FeesForwarded per tx on EVM. Fee wallets: solana 34FKjAdVcTax2DHqV2XnbXa9J3zmyKcFuFKWbcmgxjgm,
// bitcoin bc1qn2cstnjlvhxf60j3ujeyq0h0rqc7kklap8j94g, sui 0x90efcc7705e4b7753d79ae6c7430b9cb91c40ff281bc259c82f537f60be268a6
const ApiChains = LIFI_API_CHAINS.filter((chain) => !OnchainChains.includes(chain) && !LIFI_UNSUPPORTED_CHAINS.includes(chain));
const ApiFeeName = 'LIFI Fixed Fee';

const fetchOnchain = async (options: FetchOptions, category: 'swap' | 'bridge', addFee: (token: string, amount: any) => void) => {
  const forwarded: any[] = await options.getLogs({
    targets: getFeeForwarders(options.chain),
    eventAbi: FeesForwardedEvent,
    entireLog: true,
  });
  const transactions = forwarded.length ? await getFeeTransactions(options) : new Map();

  for (const log of forwarded) {
    const transaction = transactions.get(String(log.transactionHash).toLowerCase());
    if (!isJumperTransaction(transaction) || transaction.kind !== category) continue;
    for (const fee of log.args.fees) addFee(String(log.args.token), fee.amount);
  }
};

type ApiFeeLeg = { chainId: number; kind: 'swap' | 'bridge'; token: string; amount: string };

// one all-chain query per window, shared by both listings (li.quest: 100 req/min)
const apiFeeLegs = new Map<string, Promise<ApiFeeLeg[]>>();
const getApiFeeLegs = (start: number, end: number) => {
  const key = `${start}-${end}`;
  if (!apiFeeLegs.has(key)) {
    if (apiFeeLegs.size >= 24) apiFeeLegs.delete(apiFeeLegs.keys().next().value!);
    apiFeeLegs.set(key, fetchTransfersFromLIFIAPI(start, end, [...JumperIntegrators])
      .then((transfers) => transfers.flatMap((transfer) => (transfer.feeCosts ?? [])
        .filter((fee) => fee.name === ApiFeeName)
        .map((fee) => ({
          chainId: transfer.sending.chainId,
          // refunded bridges report the source chain as receiving chain
          kind: transfer.receiving.chainId === transfer.sending.chainId && transfer.substatus !== 'REFUNDED' ? 'swap' as const : 'bridge' as const,
          token: fee.token.address,
          amount: fee.amount,
        }))))
      .catch((error) => {
        apiFeeLegs.delete(key);
        throw error;
      }));
  }
  return apiFeeLegs.get(key)!;
};

const fetchFromApi = async (options: FetchOptions, category: 'swap' | 'bridge', addFee: (token: string, amount: any) => void) => {
  const chainId = Number(LifiDiamonds[options.chain].chainId ?? LifiDiamonds[options.chain].id);
  for (const fee of await getApiFeeLegs(options.startTimestamp, options.endTimestamp)) {
    if (fee.chainId === chainId && fee.kind === category) addFee(fee.token, fee.amount);
  }
};

const fetch = (category: 'swap' | 'bridge') => async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const blacklist = new Set((DefaultDexTokensBlacklisted[options.chain] ?? []).map((token) => token.toLowerCase()));
  const label = category === 'bridge' ? BridgeFee : SwapFee;

  const addFee = (token: string, amount: any) => {
    if (blacklist.has(token.toLowerCase())) return;
    // API native-asset ids
    if (options.chain === CHAIN.BITCOIN) return dailyFees.addCGToken('bitcoin', Number(amount) / 1e8, label);
    if (options.chain === CHAIN.SOLANA && token === '11111111111111111111111111111111') token = ADDRESSES.solana.SOL;
    if (options.chain === CHAIN.SUI && /^0x0*2::sui::SUI$/.test(token)) token = ADDRESSES.sui.SUI;
    dailyFees.add(token, amount, label);
  };

  if (ApiChains.includes(options.chain as CHAIN)) await fetchFromApi(options, category, addFee);
  else await fetchOnchain(options, category, addFee);

  return { dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

export const createJumperFeeAdapter = (category: 'swap' | 'bridge'): SimpleAdapter => {
  const label = category === 'bridge' ? BridgeFee : SwapFee;
  const product = category === 'bridge' ? 'bridges' : 'swaps';
  return {
  version: 2,
  pullHourly: true,
  fetch: fetch(category),
  adapter: Object.fromEntries([...OnchainChains, ...ApiChains].map((chain) => [chain, { start: JumperFeeStart }])),
  methodology: {
    Fees: `Jumper platform fees (0-5 bps depending on the assets) paid by users on ${product}.`,
    Revenue: 'All platform fees are kept by Jumper.',
    ProtocolRevenue: 'All platform fees are kept by Jumper.',
  },
  breakdownMethodology: {
    Fees: {
      [label]: `Jumper platform fees on ${product}.`,
    },
    Revenue: {
      [label]: `Jumper platform fees on ${product}.`,
    },
    ProtocolRevenue: {
      [label]: `Jumper platform fees on ${product}.`,
    },
  },
  };
};

export default createJumperFeeAdapter('swap');
