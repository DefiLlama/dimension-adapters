import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const CONFIG = {
  blue: "0x24147243f9c08d835C218Cda1e135f8dFD0517D0",
  fromBlock: 11160919,
  start: "2025-10-16",
};

const methodology = {
  Fees: "Total borrow interest paid by borrowers + liquidation bonuses earned by liquidators.",
  SupplySideRevenue: "Total interests are distributed to suppliers/lenders + liquidation bonuses to liquidators.",
  Revenue: "Total fees paid by borrowers from all markets and part of performance fee retained from all vaults.",
  ProtocolRevenue: "No revenue for Bend protocol.",
}

const MorphoBlueAbis = {
  AccrueInterest: "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
  Liquidate: "event Liquidate(bytes32 indexed id,address indexed caller,address indexed borrower,uint256 repaidAssets,uint256 repaidShares,uint256 seizedAssets,uint256 badDebtAssets,uint256 badDebtShares)",
  CreateMarket: "event CreateMarket(bytes32 indexed id, tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)",
};

type MorphoMarket = {
  marketId: string;
  loanAsset: string;
  collateralAsset?: string;
  lltv: bigint;
  lif: bigint;
};

type MorphoBlueAccrueInterestEvent = {
  token: string | undefined | null;
  interest: bigint;
  feeAmount: bigint;
};

type MorphoBlueLiquidateEvent = {
  token: string | undefined | null; // collateral asset
  lif: bigint;
  seizedAmount: bigint;
};

const toLowerKey = (id: string) => id.toLowerCase();

const ONE = 10n ** 18n;

const wMul = (x: bigint, y: bigint): bigint => (x * y / ONE);

// https://docs.morpho.org/learn/concepts/liquidation/#liquidation-incentive-factor-lif
function _getLIFFromLLTV(lltv: bigint): bigint {
  const B = BigInt(3e17) // 0.3
  const M = BigInt(115e16) // 1.15
  const LIF = BigInt(1e36) / ((B * BigInt(lltv) / BigInt(1e18)) + (BigInt(1e18) - B))
  return LIF > M ? M : LIF
}

const fetchMarketsFromLogs = async (options: FetchOptions): Promise<Array<MorphoMarket>> => {
  const markets: Array<MorphoMarket> = [];

  const events = await options.getLogs({
    target: CONFIG.blue,
    eventAbi: MorphoBlueAbis.CreateMarket,
    fromBlock: CONFIG.fromBlock,
  });

  for (const event of events) {
    markets.push({
      marketId: event.id,
      loanAsset: event.marketParams.loanToken,
      collateralAsset: event.marketParams.collateralToken,
      lltv: BigInt(event.marketParams.lltv),
      lif: _getLIFFromLLTV(BigInt(event.marketParams.lltv)),
    })
  }

  return markets;
}

const fetchEvents = async (
  options: FetchOptions
): Promise<{ interests: Array<MorphoBlueAccrueInterestEvent>, liquidations: Array<MorphoBlueLiquidateEvent> }> => {
  let markets: Array<MorphoMarket> = await fetchMarketsFromLogs(options)


  const marketMap = {} as { [key: string]: MorphoMarket };
  markets.forEach((item) => {
    marketMap[item.marketId.toLowerCase()] = item;
  });

  const interests: Array<MorphoBlueAccrueInterestEvent> = (
    await options.getLogs({
      eventAbi: MorphoBlueAbis.AccrueInterest,
      target: CONFIG.blue,
    })
  ).map((log: any) => {
    const key = toLowerKey(String(log.id));
    const market = marketMap[key];

    const interest = BigInt(log.interest);
    const feeAmount = BigInt(log.feeShares);

    return {
      token: market?.loanAsset ?? null,
      interest,
      feeAmount,
    };
  });


  const liquidations: Array<MorphoBlueLiquidateEvent> = (
    await options.getLogs({
      eventAbi: MorphoBlueAbis.Liquidate,
      target: CONFIG.blue,
    })
  ).map((log) => {
    const key = toLowerKey(String(log.id));
    const market = marketMap[key];
    if (!market) return null;

    return {
      token: market.collateralAsset ?? null,
      lif: market.lif,
      seizedAmount: BigInt(log.seizedAssets),
    };
  })
    .filter((x) => x !== null);

  return { interests, liquidations }
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { interests, liquidations } = await fetchEvents(options);

  for (const event of interests) {
    if (!event.token) continue;

    dailyFees.add(event.token, event.interest, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.add(event.token, Number(event.interest) - Number(event.feeAmount), METRIC.BORROW_INTEREST)
    dailyRevenue.add(event.token, event.feeAmount, METRIC.BORROW_INTEREST)
  }

  for (const event of liquidations) {
    if (!event.token) continue;

    const repaid = (BigInt(event.seizedAmount) * ONE) / event.lif;
    const bonus = BigInt(event.seizedAmount) - repaid;

    dailyFees.add(event.token, bonus, METRIC.LIQUIDATION_FEES);
    dailySupplySideRevenue.add(event.token, bonus, METRIC.LIQUIDATION_FEES);
  }

  return {
    dailyFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets.',
      [METRIC.LIQUIDATION_FEES]: 'All bonuses earned by liquidators from liquidations.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Share of interest for Bend protocol.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'All interests paid are distributedd to vaults suppliers, lenders.',
      [METRIC.LIQUIDATION_FEES]: 'All bonuses earned by liquidators from liquidations.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Share of interest for Bend protocol.',
    },
  },
  fetch: fetch,
  chains: [CHAIN.BERACHAIN],
  start: CONFIG.start,
};

export default adapter;