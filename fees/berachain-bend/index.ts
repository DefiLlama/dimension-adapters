import { request } from "graphql-request";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONFIG = {
  blue: "0x24147243f9c08d835C218Cda1e135f8dFD0517D0",
  start: "2025-10-16",
};

const methodology = {
  Fees: "Total borrow interest paid by borrowers + liquidation bonuses earned by liquidators.",
  SupplySideRevenue: "Total interests are distributed to suppliers/lenders + liquidation bonuses to liquidators.",
  Revenue: "Total fees paid by borrowers from all markets and part of performance fee retained from all vaults.",
  ProtocolRevenue: "No revenue for Bend protocol.",
}


const abi = {
  morphoBlueFunctions: {
    idToMarketParams: "function idToMarketParams(bytes32 Id) returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
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
    Liquidate: "event Liquidate(bytes32 indexed id,address indexed caller,address indexed borrower,uint256 repaidAssets,uint256 repaidShares,uint256 seizedAssets,uint256 badDebtAssets,uint256 badDebtShares)",
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

const _fetchMarkets = async (options: FetchOptions): Promise<Array<MorphoMarket>> => {
  const whitelistedVaults = await _getWhitelistedVaults();

  const marketIds = await options.api.fetchList(
    { lengthAbi: 'withdrawQueueLength', itemAbi: abi.metaMorphoFunctions.withdrawQueue, targets: whitelistedVaults }
  )

  const [marketsData, marketsFees] = await Promise.all([
    options.api.multiCall({
      target: CONFIG.blue,
      calls: marketIds,
      abi: abi.morphoBlueFunctions.idToMarketParams,
    }),
    options.api.multiCall({
      target: CONFIG.blue,
      calls: marketIds,
      abi: abi.morphoBlueFunctions.market,
    }),
  ]);

  return marketsData.map((item: any, idx: number) => {
    return {
      marketId: marketIds[idx],
      loanAsset: item.loanToken,
      collateralAsset: item.collateralToken,
      lltv: item.lltv,
      lif: _getLIFFromLLTV(item.lltv),
      fee: BigInt(marketsFees[idx]?.fee),
    };
  });
}

const fetchEvents = async (
  options: FetchOptions
): Promise<{ interests: Array<MorphoBlueAccrueInterestEvent>, liquidations: Array<MorphoBlueLiquidateEvent> }> => {
  let markets: Array<MorphoMarket> = await _fetchMarkets(options)


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
  const dailyRevenuesFee = options.createBalances();

  const { interests, liquidations } = await fetchEvents(options);

  const performanceFees = await fetchPerformanceFees(options)

  for (const event of interests) {
    if (!event.token) continue;

    dailyFees.add(event.token, event.interest)
    dailyRevenuesFee.add(event.token, event.feeAmount)
  }

  for (const event of liquidations) {
    if (!event.token) continue;

    const repaid = (BigInt(event.seizedAmount) * ONE) / event.lif;
    const bonus = BigInt(event.seizedAmount) - repaid;
    dailyFees.add(event.token, bonus);
  }

  for (const performanceFee of performanceFees ) {
    dailyRevenuesFee.add(performanceFee.token, performanceFee.amount)
  }

  return {
    dailyFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: dailyRevenuesFee,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: methodology,
  fetch: fetch,
  chains: [CHAIN.BERACHAIN],
  start: CONFIG.start,
};

export default adapter;