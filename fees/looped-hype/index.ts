import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const LHYPE = {
  shareToken: "0x5748ae796AE46A4F1348a1693de4b50560485562",
  accountant: "0xcE621a3CA6F72706678cFF0572ae8d15e5F001c3",
  accountantAbi: "function getRate() view returns (uint256)",
  erDecimals: 1e18,
  shareDecimals: 1e18,
};

const BASE_COINGECKO_ID = "hyperliquid";

const FEE_SWITCH_TS = Math.floor(Date.UTC(2025, 9, 17) / 1000);

function getPerfFeeRateForDay(options: FetchOptions): number {
  const ts =
    (options as any).timestamp ??
    (options as any).startTimestamp ??
    (options as any).start ??
    (options as any).fromTimestamp ??
    Math.floor(Date.now() / 1000);

  return ts >= FEE_SWITCH_TS ? 0.20 : 0.00;
}

async function erBeforeAfter(
  options: FetchOptions,
  target: string,
  abi: string,
): Promise<[number | null, number | null]> {
  const [before, after] = await Promise.all([
    options.fromApi.call({ target, abi, params: [], permitFailure: true }),
    options.toApi.call({ target, abi, params: [], permitFailure: true }),
  ]);
  if (before == null || after == null) return [null, null];
  return [Number(before), Number(after)];
}

const fetch: Adapter["fetch"] = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const totalSharesRaw = await options.api.call({
    target: LHYPE.shareToken,
    abi: "function totalSupply() view returns (uint256)",
    permitFailure: true,
  });

  const [erBefore, erAfter] = await erBeforeAfter(
    options,
    LHYPE.accountant,
    LHYPE.accountantAbi,
  );

  if (!totalSharesRaw || erBefore == null || erAfter == null) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }

  const shares = Number(totalSharesRaw) / LHYPE.shareDecimals;

  const growthPerShare = (erAfter - erBefore) / LHYPE.erDecimals;

  if (growthPerShare <= 0) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }

  const grossRewards = shares * growthPerShare;
  const perfFee = getPerfFeeRateForDay(options);
  const protocolRevenue = grossRewards * perfFee;
  const supplySideRevenue = grossRewards - protocolRevenue;

  dailyFees.addCGToken(BASE_COINGECKO_ID, grossRewards);
  dailySupplySideRevenue.addCGToken(BASE_COINGECKO_ID, supplySideRevenue);
  dailyRevenue.addCGToken(BASE_COINGECKO_ID, protocolRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees:
      "Staking rewards and fees accumulated on the strategy pools and vaults.",
    Revenue:
      "The share of staking rewards and fees for Looping Collective.",
    ProtocolRevenue:
      "The share of staking rewards and fees for Looping Collective.",
    SupplySideRevenue:
      "The share of yield distributed to LHYPE depositors",
  },
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-02-18",
};

export default adapter;
