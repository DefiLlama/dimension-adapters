import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_CONTRACT = "0x3Aa5A591f79Ae2A9790B7335fab875Bb0625A5bc";
const USDC = ADDRESSES.base.USDC;

const FEE_EVENT_ABI = 'event FeesCharged(address indexed payer, address indexed token, uint256 amount, uint256 pricePerShare)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // 1) Capture direct USDC transfers to the fee collector (fast indexer path)
  try {
    const usdcReceived = await addTokensReceived({
      options,
      target: FEE_CONTRACT,
      token: USDC,
    });
    // addTokensReceived returns a Balances object — merge into dailyFees
    dailyFees.addBalances(usdcReceived as any);
  } catch (e) {
    // fallback: continue and rely on event parsing below
    console.error('Pred: failed to read USDC transfers via indexer', (e as any)?.message);
  }

  // 2) Parse protocol fee events emitted by the fee contract. When token is USDC
  // treat `amount` as USD (1:1). For other tokens, if `pricePerShare` is emitted
  // use it to convert token amount -> USD: usd = amount * pricePerShare / 1e18.
  // If pricePerShare is not present, keep the raw token amount (will be priced later).
  let feeEvents: any[] = [];
  try {
    feeEvents = await options.getLogs({
      target: FEE_CONTRACT,
      eventAbi: FEE_EVENT_ABI,
    });
  } catch (e) {
    // Not fatal — some deployments may not emit this exact event signature.
  }

  for (const ev of feeEvents) {
    const args = ev.args ?? ev;
    const token = (args.token ?? args[1] ?? ev.token ?? ev.address)?.toLowerCase();
    const amountRaw = args.amount ?? args[2] ?? ev.amount ?? ev.data ?? 0;
    const pricePerShare = args.pricePerShare ?? args[3] ?? null;

    // Normalize numeric value
    const amount = Number(amountRaw || 0);

    if (!token) continue;

    if (token === USDC.toLowerCase()) {
      // USDC: amount is in USDC smallest units (6 decimals). Add as USD value.
      dailyFees.addUSDValue(amount / 1e6, 'Trading Fees');
    } else if (pricePerShare) {
      // pricePerShare expected to be 1e18-scaled multiplier converting token->USDC
      const pps = Number(pricePerShare);
      const usd = (amount * pps) / 1e18;
      dailyFees.addUSDValue(usd, 'Trading Fees');
    } else {
      // unknown token without pricePerShare: record token amount (deferred pricing)
      dailyFees.add(token, amount, 'Trading Fees');
    }
  }

  const dailyRevenue = dailyFees.clone ? dailyFees.clone(1, 'Trading Fees') : dailyFees;

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users on Pred prediction-market trades on Base.",
  Revenue: "All recorded on-chain trade fees accrue to the protocol for the current deployment.",
  ProtocolRevenue: "All recorded on-chain trade fees accrue to the protocol for the current deployment.",
};

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "Trade fees charged by Pred on each order fill on the Base exchange contracts.",
  },
  Revenue: {
    "Trading Fees": "Trade fees charged by Pred on each order fill on the Base exchange contracts.",
  },
  ProtocolRevenue: {
    "Trading Fees": "Trade fees charged by Pred on each order fill on the Base exchange contracts.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-02-05",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
