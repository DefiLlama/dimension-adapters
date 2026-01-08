import { request } from "graphql-request";
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
  Revenue: "Total interest paid by borrowers and part of performance fees share for Bend protocol.",
  ProtocolRevenue: "Total interest paid by borrowers and part of performance fees share for Bend protocol.",
}

const abi = {
  morphoBlueFunctions: {
    market: "function market(bytes32 input) returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
    feeRecipient: "function feeRecipient() returns(address feeRecipient)"
  },
  metaMorphoFunctions: {
    withdrawQueueLength: "function withdrawQueueLength() view returns (uint256)",
    withdrawQueue: "function withdrawQueue(uint256 index) view returns (bytes32)",
    asset: "function asset() view returns (address)",
    convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)"
  },
  morphoBlueEvents: {
    AccrueInterest: "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
    CreateMarket: "event CreateMarket(bytes32 indexed id, tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)",
    Liquidate: "event Liquidate(bytes32 indexed id,address indexed caller,address indexed borrower,uint256 repaidAssets,uint256 repaidShares,uint256 seizedAssets,uint256 badDebtAssets,uint256 badDebtShares)"
  },
  metaMorphoEvents: {
    Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)"
  }
}

type MorphoMarket = {
  marketId: string;
  loanAsset: string;
  collateralAsset?: string;
  lltv: bigint;
  lif: bigint;
  fee: bigint;
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

type PerformanceFee = {
  token: string,
  amount: bigint
}

type RewardVault = {
  stakingTokenAddress: string
}

const BERACHAIN_API = "https://api.berachain.com";


const toLowerKey = (id: string) => id.toLowerCase();

const ONE = 10n ** 18n;

const wMul = (x: bigint, y: bigint): bigint => (x * y / ONE);

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

// https://docs.morpho.org/learn/concepts/liquidation/#liquidation-incentive-factor-lif
function _getLIFFromLLTV(lltv: bigint): bigint {
  const B = BigInt(3e17) // 0.3
  const M = BigInt(115e16) // 1.15
  const LIF = BigInt(1e36) / ((B * BigInt(lltv) / BigInt(1e18)) + (BigInt(1e18) - B))
  return LIF > M ? M : LIF
}

const _getWhitelistedVaults = async () => {
  const data = await request(BERACHAIN_API, `
          {
              polGetRewardVaults(where: {protocolsIn: ["Bend"], includeNonWhitelisted: false}) {
                  vaults {
                      stakingTokenAddress
                  }
              }
          }
      `);
  return data.polGetRewardVaults.vaults.map((v: RewardVault) => v.stakingTokenAddress);
}

const fetchMarketsFromLogs = async (options: FetchOptions): Promise<Array<MorphoMarket>> => {
  const markets: Array<MorphoMarket> = [];

  const events = await options.getLogs({
    target: CONFIG.blue,
    eventAbi: abi.morphoBlueEvents.CreateMarket,
    fromBlock: CONFIG.fromBlock,
		cacheInCloud: true,
  });

  const marketIds = events.map(event => event.id)

  const marketsInfo = await options.api.multiCall({
    target: CONFIG.blue,
    calls: marketIds,
    abi: abi.morphoBlueFunctions.market,
  });

  events.forEach((event, idx) => {
    markets.push({
      marketId: event.id,
      loanAsset: event.marketParams.loanToken,
      collateralAsset: event.marketParams.collateralToken,
      lltv: BigInt(event.marketParams.lltv),
      lif: _getLIFFromLLTV(BigInt(event.marketParams.lltv)),
      fee: BigInt(marketsInfo[idx]?.fee)
    })
  })

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
      eventAbi: abi.morphoBlueEvents.AccrueInterest,
      target: CONFIG.blue,
    })
  ).map((log: any) => {
    const key = toLowerKey(String(log.id));
    const market = marketMap[key];

    const interest = BigInt(log.interest);
    const feeParam = market?.fee ?? 0n;

    const feeAmount = wMul(interest, feeParam);

    return {
      token: market?.loanAsset ?? null,
      interest,
      feeAmount,
    };
  });


  const liquidations: Array<MorphoBlueLiquidateEvent> = (
    await options.getLogs({
      eventAbi: abi.morphoBlueEvents.Liquidate,
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


const fetchPerformanceFees = async (options: FetchOptions): Promise<Array<PerformanceFee>> => {
  const vaults = await _getWhitelistedVaults();

  const [feeRecipient, underlyingAssets] = await Promise.all(
    [
      options.api.call({
        abi: abi.morphoBlueFunctions.feeRecipient,
        target: CONFIG.blue,
      }),
      options.api.multiCall({
        abi: abi.metaMorphoFunctions.asset,
        calls: vaults,
      }
      )
    ])

  return Promise.all(vaults.map(async (v: string, idx: number) => {
    const sharesAmount = (await options.getLogs({
      target: v,
      eventAbi: abi.metaMorphoEvents.Transfer,
    }))
      .filter(log => log[0] == ZERO_ADDRESS && log[1] == feeRecipient)
      .map(log => log[2])
      .reduce((totalAmount: bigint, value: bigint) => totalAmount + value, 0n);

    const assetAmount = await options.api.call({
      target: v,
      abi: abi.metaMorphoFunctions.convertToAssets,
      params: [sharesAmount]
    })

    return {
      token: underlyingAssets[idx],
      amount: assetAmount
    } as PerformanceFee
  }))
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { interests, liquidations } = await fetchEvents(options);
  const performanceFees = await fetchPerformanceFees(options)

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

  for (const performanceFee of performanceFees) {
    dailyFees.add(performanceFee.token, performanceFee.amount, METRIC.PERFORMANCE_FEES)
    dailyRevenue.add(performanceFee.token, performanceFee.amount, METRIC.PERFORMANCE_FEES)
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
      [METRIC.PERFORMANCE_FEES]: 'Share of interest for Bend protocol paid by Vault curator.',
      [METRIC.LIQUIDATION_FEES]: 'All bonuses earned by liquidators from liquidations.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Share of interest for Bend protocol.',
      [METRIC.PERFORMANCE_FEES]: 'Share of interest for Bend protocol paid by Vault curator.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'All interests paid are distributedd to vaults suppliers, lenders.',
      [METRIC.LIQUIDATION_FEES]: 'All bonuses earned by liquidators from liquidations.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Share of interest for Bend protocol.',
      [METRIC.PERFORMANCE_FEES]: 'Share of interest for Bend protocol paid by Vault curator.',
    },
  },
  fetch: fetch,
  chains: [CHAIN.BERACHAIN],
  start: CONFIG.start,
};

export default adapter;