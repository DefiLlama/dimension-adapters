import * as sdk from "@defillama/sdk";
import { getBlock } from "@defillama/sdk/build/util/blocks";
import BigNumber from "bignumber.js";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abis: any = {
  revenueResolver: {
    calcRevenueSimulatedTime:
      "function calcRevenueSimulatedTime(uint256 totalAmounts_,uint256 exchangePricesAndConfig_,uint256 liquidityTokenBalance_,uint256 simulatedTimestamp_) public view returns (uint256 revenueAmount_)",
    getRevenue:
      "function getRevenue(address token_) public view returns (uint256 revenueAmount_)",
  },
  liquidityResolver: {
    listedTokens:
      "function listedTokens() public view returns (address[] listedTokens_)",
    getExchangePricesAndConfig:
      "function getExchangePricesAndConfig(address token_) public view returns (uint256)",
    getTotalAmounts:
      "function getTotalAmounts(address token_) public view returns (uint256)",
  },
  vaultResolver_before_19992222: {
    getAllVaultsAddresses:
      "function getAllVaultsAddresses() external view returns (address[] vaults_)",
    getVaultEntireData:
      "function getVaultEntireData(address vault_) view returns ((address vault, (address liquidity, address factory, address adminImplementation, address secondaryImplementation, address supplyToken, address borrowToken, uint8 supplyDecimals, uint8 borrowDecimals, uint256 vaultId, bytes32 liquiditySupplyExchangePriceSlot, bytes32 liquidityBorrowExchangePriceSlot, bytes32 liquidityUserSupplySlot, bytes32 liquidityUserBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePrice, address rebalancer) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateVault, uint256 borrowRateVault, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, uint256 rewardsRate) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidity, uint256 totalBorrowLiquidity, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable) liquidityUserBorrowData) vaultData_)",
  },
  vaultResolver_after_19992222: {
    getAllVaultsAddresses:
      "function getAllVaultsAddresses() external view returns (address[] vaults_)",
    getVaultEntireData:
      "function getVaultEntireData(address vault_) view returns ((address vault, (address liquidity, address factory, address adminImplementation, address secondaryImplementation, address supplyToken, address borrowToken, uint8 supplyDecimals, uint8 borrowDecimals, uint256 vaultId, bytes32 liquiditySupplyExchangePriceSlot, bytes32 liquidityBorrowExchangePriceSlot, bytes32 liquidityUserSupplySlot, bytes32 liquidityUserBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePriceOperate, uint256 oraclePriceLiquidate, address rebalancer) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateVault, uint256 borrowRateVault, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, uint256 rewardsRate) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidity, uint256 totalBorrowLiquidity, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization) liquidityUserBorrowData) vaultData_)",
  },
  vault: {
    constantsView:
      "function constantsView() public view returns((address liquidity,address factory,address adminImplementation,address secondaryImplementation,address supplyToken,address borrowToken,uint8 supplyDecimals,uint8 borrowDecimals,uint vaultId,bytes32 liquiditySupplyExchangePriceSlot,bytes32 liquidityBorrowExchangePriceSlot,bytes32 liquidityUserSupplySlot,bytes32 liquidityUserBorrowSlot))",
  },
};

const revenueResolver = async (api: sdk.ChainApi) => {
  const block = await api.getBlock();

  let address;
  let abi = abis.revenueResolver;
  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 19784319) {
        break; // fluid RevenueResolver Exist After Block 19784319
      }
      if (block < 20138676) {
        address = "0x0F683159f14857D61544650607549Cdc21abE774";
        break;
      }
      address = "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      break;
    case CHAIN.ARBITRUM:
      address = "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      break;
    case CHAIN.BASE:
      address = "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      break;
  }

  return {
    calcRevenueSimulatedTime: async (
      totalAmounts: string,
      exchangePricesAndConfig: string,
      liquidityTokenBalance: string | BigNumber,
      timestamp: string | number
    ) => {
      if (!address) {
        return 0;
      }

      return await api.call({
        target: address,
        abi: abi.calcRevenueSimulatedTime,
        params: [
          totalAmounts,
          exchangePricesAndConfig,
          liquidityTokenBalance as string,
          timestamp,
        ],
      });
    },
    getRevenue: async (token: string) => {
      if (!address) {
        return 0;
      }

      return await api.call({
        target: address,
        abi: abi.getRevenue,
        params: [token],
      });
    },
  };
};

const liquidityResolver = async (api: sdk.ChainApi) => {
  const block = await api.getBlock();

  let address;
  let abi = abis.liquidityResolver;
  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 19992056) {
        address = "0x741c2Cd25f053a55fd94afF1afAEf146523E1249";
        break;
      }
      address = "0xD7588F6c99605Ab274C211a0AFeC60947668A8Cb";
      break;
    case CHAIN.ARBITRUM:
      address = "0x46859d33E662d4bF18eEED88f74C36256E606e44";
      break;
    case CHAIN.BASE:
      address = "0x35A915336e2b3349FA94c133491b915eD3D3b0cd";
      break;
  }

  return {
    listedTokens: async () => {
      if (!address) {
        return [];
      }

      return await api.call({
        target: address,
        abi: abi.listedTokens,
        params: undefined,
      });
    },
    getExchangePricesAndConfig: async (tokens: string[]) => {
      if (!address) {
        return 0;
      }

      return await api.multiCall({
        abi: abi.getExchangePricesAndConfig,
        calls: tokens.map((token) => ({ target: address, params: [token] })),
      });
    },
    getTotalAmounts: async (tokens: string[]) => {
      if (!address) {
        return 0;
      }

      return await api.multiCall({
        abi: abi.getTotalAmounts,
        calls: tokens.map((token) => ({ target: address, params: [token] })),
      });
    },
  };
};

const vaultResolver = async (api: sdk.ChainApi) => {
  const block = await api.getBlock();

  let address;
  let abi = abis.vaultResolver_after_19992222;
  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 19313700) {
        // vault resolver related revenue only exists after this block. revenue / fees before are negligible
        break;
      }

      if (block < 19662786) {
        address = "0x8DD65DaDb217f73A94Efb903EB2dc7B49D97ECca";
        abi = abis.vaultResolver_before_19992222;
        break;
      }
      if (block < 19992222) {
        address = "0x93CAB6529aD849b2583EBAe32D13817A2F38cEb4";
        abi = abis.vaultResolver_before_19992222;
        break;
      }
      if (block < 20983000) {
        address = "0x56ddF84B2c94BF3361862FcEdB704C382dc4cd32";
        break;
      }
      // above VaultResolver for T1 type vaults only
      address = "0x6922b85D6a7077BE56C0Ae8Cab97Ba3dc4d2E7fA"; // VaultT1Resolver compatibility for all vault types
      break;
    case CHAIN.ARBITRUM:
      address = "0x77648D39be25a1422467060e11E5b979463bEA3d";
      break;
    case CHAIN.BASE:
      address = "0x94695A9d0429aD5eFec0106a467aDEaDf71762F9";
      break;
  }

  return {
    getAllVaultsAddresses: async () => {
      if (!address) {
        return [];
      }

      return await api.call({
        target: address,
        abi: abi.getAllVaultsAddresses,
        params: undefined,
      });
    },
    getVaultEntireData: async (vaults: string[]) => {
      if (!address) {
        return null;
      }

      return await api.multiCall({
        abi: abi.getVaultEntireData,
        calls: vaults.map((vault) => ({ target: address, params: [vault] })),
        permitFailure: true,
      });
    },
  };
};

const config: any = {
  liquidity: "0x52aa899454998be5b000ad077a46bbe360f4e497",
  ethereum: {
    dataStartTimestamp: 1708246655, // ~ when liquidity resolver was deployed

    revenueResolverExistAfterBlock: 19959852,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1708931052,
    vaultResolverExistAfterBlock: 19313700,
  },
  arbitrum: {
    dataStartTimestamp: 1720018638, // ~ before any activity started (block 228361633)

    revenueResolverExistAfterBlock: 228361632,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1720018637,
    vaultResolverExistAfterBlock: 228361632,
  },
  base: {
    dataStartTimestamp: 1723484700, // ~ before any activity started (block 18347681)

    revenueResolverExistAfterBlock: 18347681,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1723484700,
    vaultResolverExistAfterBlock: 18347681,
  },
};

const methodologyFluid = {
  Fees: "Interest paid by borrowers",
  Revenue: "Percentage of interest going to treasury",
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  return {
    dailyFees: await getFeesFromTo(options),
    dailyRevenue: await getRevenueFromTo(options),
  };
};
const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: config.ethereum.dataStartTimestamp,
      meta: {
        methodology: methodologyFluid,
      },
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: config.arbitrum.dataStartTimestamp,
      meta: {
        methodology: methodologyFluid,
      },
    },
    [CHAIN.BASE]: {
      fetch,
      start: config.base.dataStartTimestamp,
      meta: {
        methodology: methodologyFluid,
      },
    },
  },
};

export default adapter;

const getFeesFromTo = async (
  options: FetchOptions
): Promise<sdk.Balances> => {

  const liquidityOperateLogs = (await options.getLogs({
    target: config.liquidity,
    onlyArgs: true,
    eventAbi: "event LogOperate(address indexed user,address indexed token,int256 supplyAmount,int256 borrowAmount,address withdrawTo,address borrowTo,uint256 totalAmounts,uint256 exchangePricesAndConfig)",
  })) as any[];

  const dailyFees = options.createBalances();

  const fromApi = options.fromApi;
  const toApi = options.toApi;
  const vaults: string[] = await (
    await vaultResolver(toApi)
  ).getAllVaultsAddresses();

  const vaultEntiresDataFrom: any[] = (await (
    await vaultResolver(fromApi)
  ).getVaultEntireData(vaults)) as any[];

  const vaultEntiresDataTo: any[] = (await (
    await vaultResolver(toApi)
  ).getVaultEntireData(vaults)) as any[];

  const vaultBorrowTokenCall = (await toApi.multiCall({
    abi: abis.vault.constantsView,
    calls: vaults,
  })) as { borrowToken: string }[];


  for (const [index, vault] of vaults.entries()) {
    let borrowBalance = new BigNumber(0);
    let borrowToken = "";
    try {
      const { constantVariables, totalSupplyAndBorrow } = vaultEntiresDataFrom[index];

      borrowToken = constantVariables.borrowToken;
      borrowBalance = new BigNumber(totalSupplyAndBorrow.totalBorrowVault);
    } catch (ex) {
      // when vault did not exist yet, getVaultEntireData() will revert. at from block then we start from 0 balance.
    }

    if (!borrowToken) {
      const { borrowToken: vaultBorrowToken } = vaultBorrowTokenCall[index];
      borrowToken = vaultBorrowToken;
    }

    // get block numbers where an update to vault borrow amounts happened + start block and end block
    const vaultOperates = liquidityOperateLogs.filter(
      (x) =>
        x[0] == vault && // filter user must be vault
        x[1] == borrowToken // filter token must be vault borrow token (ignore supply / withdraw)
    );

    for (const vaultOperate of vaultOperates) {
      borrowBalance = borrowBalance.plus(new BigNumber(vaultOperate[3]));
    }
    try {
      const { totalSupplyAndBorrow: totalSupplyAndBorrowTo } = vaultEntiresDataTo[index];

      dailyFees.add(
        borrowToken,
        new BigNumber(totalSupplyAndBorrowTo.totalBorrowVault).minus(
          borrowBalance
        )
      );
    } catch (ex) {}

  }

  return dailyFees;
};

const getRevenueFromTo = async (
  options: FetchOptions
): Promise<number> => {
  const LPRsevenueFromTo = await getLiquidityRevenueFromTo(options);
  const vaultRevenueFromTo = await getVaultsMagnifierRevenueFromTo(options);
  return LPRsevenueFromTo + vaultRevenueFromTo;
};

const getLiquidityRevenueFromTo = async (
  options: FetchOptions
) => {
  const { fromTimestamp, toTimestamp, api } = options;
  const tokens: string[] = await (await liquidityResolver(api)).listedTokens();

  const collectRevenueLogs: [string, BigNumber][] = (await options.getLogs({
    target: config.liquidity,
    eventAbi:
      "event LogCollectRevenue(address indexed token, uint256 indexed amount)",
  })) as [string, BigNumber][];

  const revenueFrom: BigNumber[] = await getLiquidityUncollectedRevenueAt(
    api,
    fromTimestamp,
    tokens
  );

  const revenueTo:BigNumber[] = await getLiquidityUncollectedRevenueAt(
    api,
    toTimestamp,
    tokens
  );
  const dailyValues = options.createBalances();
  for await (const [index, token] of tokens.entries()) {

    // consider case where collect revenue has been executed in the time frame
    const logs = collectRevenueLogs.filter((x) => x[0] == token);
    const collectedRevenue: BigNumber = logs.reduce((sum: BigNumber, x) => {
      return sum.plus(x[1]);
    }, new BigNumber(0));

    // add collected revenue in time frame to the to time point revenue.
    // to revenue = uncollected at that point + all collected revenue since from
    const _revenueTo = BigNumber(revenueTo[index])
    _revenueTo.plus(collectedRevenue);

    // get uncollected revenue in from -> to timespan
    dailyValues.add(
      token,
      _revenueTo.gt(revenueFrom[index])
        ? _revenueTo.minus(revenueFrom[index])
        : new BigNumber(0)
    );
  }

  return await dailyValues.getUSDValue();
};

const getLiquidityUncollectedRevenueAt = async (
  api: sdk.ChainApi,
  timestamp: number,
  tokens: string[]
) => {
  const timestampedApi = new sdk.ChainApi({
    chain: api.chain,
    block: (await getBlock(api.chain, timestamp)).number,
  });

  // check if token was listed at that timestamp at Liquidity, if not, revenue is 0

  // get liquidity packed storage slots data at timestamped Api block number
  const totalAmounts: any[] = await (
    await liquidityResolver(timestampedApi)
  ).getTotalAmounts(tokens) as any[];

  const exchangePricesAndConfig: any[] = await (
    await liquidityResolver(timestampedApi)
  ).getExchangePricesAndConfig(tokens) as any[];

  const ee = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const findIndex = tokens.findIndex((x) => x.toLowerCase() === ee);
  const liquidityTokenBalance: string[] = await timestampedApi.multiCall({
    abi: "erc20:balanceOf",
    calls: tokens
      .filter(e => e.toLowerCase() !== ee)
      .map((token) => ({ target: token, params: [config.liquidity] })),
  });

  if (findIndex != -1) {
    const eeBalance = (
      await sdk.api.eth.getBalance({
        target: config.liquidity,
        chain: timestampedApi.chain,
        block: await timestampedApi.getBlock(),
      })
    ).output;
    liquidityTokenBalance.splice(findIndex, 0, eeBalance);
  }


  // // pass data into revenue resolver, available at current api block, which calculates revenue at the
  // // simulated timestamp based on storage slots data
  const uncollectedRevenue: BigNumber[] = []
  for(const [index, _token] of tokens.entries()) {
    try {
      const _uncollectedRevenue = await (
        await revenueResolver(api)
      ).calcRevenueSimulatedTime(
        totalAmounts[index],
        exchangePricesAndConfig[index],
        liquidityTokenBalance[index],
        timestamp
      );
      uncollectedRevenue.push(new BigNumber(_uncollectedRevenue));
    } catch (ex) {
      console.error(ex);
    }
  }

  return uncollectedRevenue;
};

const getVaultsMagnifierRevenueFromTo = async (
  options: FetchOptions
) => {
  const { fromTimestamp, toTimestamp, api } = options;
  if (toTimestamp < config[api.chain].vaultResolverExistAfterTimestamp) {
    return 0;
  }

  const vaults: string[] = await (
    await vaultResolver(api)
  ).getAllVaultsAddresses();

  const fromBalancesApi = await getVaultMagnifierUncollectedRevenueAt(
    api,
    fromTimestamp,
    vaults,
    options
  );

  let toBalancesApi = await getVaultMagnifierUncollectedRevenueAt(
    api,
    toTimestamp,
    vaults,
    options
  );

  toBalancesApi = await getVaultMagnifierCollectedRevenueFromTo(
      options,
      vaults
  );

  const revenueFrom = await fromBalancesApi.getUSDValue();
  const revenueTo = await toBalancesApi.getUSDValue();

  return revenueTo > revenueFrom ? revenueTo - revenueFrom : 0;
};

const getVaultMagnifierCollectedRevenueFromTo = async (
  options: FetchOptions,
  vaults: string[],
) => {
  const values = options.createBalances();
  const rebalanceEventLogs =  await options.getLogs({
    targets: vaults,
    onlyArgs: true,
    flatten: false,
    eventAbi:
      /// @notice emitted when a `rebalance()` has been executed, balancing out total supply / borrow between Vault
      /// and Fluid Liquidity pools.
      /// if `colAmt_` is negative then profit, meaning withdrawn from vault and sent to rebalancer address.
      /// if `debtAmt_` is positive then profit, meaning borrow from vault and sent to rebalancer address.
      "event LogRebalance(int colAmt_, int debtAmt_)",
  })

  if (rebalanceEventLogs.length == 0) {
    return values
  }


  // get collateral and borrow token of the vault
  const contractViews: any[] = await options.api.multiCall({
    abi: abis.vault.constantsView,
    calls: vaults.map((vault) => ({ target: vault })),
  });

  rebalanceEventLogs.forEach((logs, index) => {
    logs.forEach((log: any) => {
      if (log.colAmt.isNegative()) {
        // add collateral token amount to balances
        const colAmt = new BigNumber(log.colAmt_);
        values.add(contractViews[index].supplyToken, colAmt.absoluteValue());
      }
      if (log.debtAmt.isPositive()) {
        // add borrow token amount to balances
        const debtAmt = new BigNumber(log.debtAmt_);
        values.add(contractViews[index].borrowToken, debtAmt);
      }
    })
  });
  return values;
};

const getVaultMagnifierUncollectedRevenueAt = async (
  api: sdk.ChainApi,
  timestamp: number,
  vaults: string[],
  options: FetchOptions
) => {
  const values = options.createBalances();
  if (timestamp < config[api.chain].vaultResolverExistAfterTimestamp) {
    // vault resolver related revenue only exists after this timestamp. before this there has been no such revenue.
    return values;
  }

  const targetBlock = (await getBlock(api.chain, timestamp)).number;

  const timestampedApi = new sdk.ChainApi({
    chain: api.chain,
    block: targetBlock,
  });
  const vaultEntiresDataFrom: any[] = await (
    await vaultResolver(timestampedApi)
  ).getVaultEntireData(vaults) as any[];

  for (const [index, _vault] of vaults.entries()) {
    try {
      const { totalSupplyAndBorrow , constantVariables} = vaultEntiresDataFrom[index];
      const totalSupplyVault = new BigNumber(
        totalSupplyAndBorrow.totalSupplyVault
      );
      const totalBorrowVault = new BigNumber(
        totalSupplyAndBorrow.totalBorrowVault
      );
      const totalSupplyLiquidity = new BigNumber(
        totalSupplyAndBorrow.totalSupplyLiquidity
      );
      const totalBorrowLiquidity = new BigNumber(
        totalSupplyAndBorrow.totalBorrowLiquidity
      );

      // if more supply at liquidity than at vault -> uncollected profit
      const supplyTokenProfit = totalSupplyLiquidity.gt(totalSupplyVault)
        ? totalSupplyLiquidity.minus(totalSupplyVault)
        : new BigNumber(0);
      // if less borrow at liquidity than at vault -> profit
      const borrowTokenProfit = totalBorrowVault.gt(totalBorrowLiquidity)
        ? totalBorrowVault.minus(totalBorrowLiquidity)
        : new BigNumber(0);

      values.add(constantVariables.supplyToken, supplyTokenProfit);
      values.add(constantVariables.borrowToken, borrowTokenProfit);
    } catch (ex) {
      // when vault did not exist yet, getVaultEntireData() will revert. at from block then we start from 0 balance.
    }
  }
  return values;
};
// yarn test fees fluid
