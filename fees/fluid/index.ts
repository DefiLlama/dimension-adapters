import * as sdk from "@defillama/sdk";
import { getBlock } from "@defillama/sdk/build/util/blocks";
import BigNumber from "bignumber.js";
import { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abis = {
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
    getExchangePricesAndConfig: async (token: string) => {
      if (!address) {
        return 0;
      }

      return await api.call({
        target: address,
        abi: abi.getExchangePricesAndConfig,
        params: [token],
      });
    },
    getTotalAmounts: async (token: string) => {
      if (!address) {
        return 0;
      }

      return await api.call({
        target: address,
        abi: abi.getTotalAmounts,
        params: [token],
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
      address = "0x56ddF84B2c94BF3361862FcEdB704C382dc4cd32";
      break;
    case CHAIN.ARBITRUM:
      if (block < 228361633) {
        // vault resolver related revenue only exists after this block. no revenue / fees before
        break;
      }
      address = "0x77648D39be25a1422467060e11E5b979463bEA3d";

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
    getVaultEntireData: async (vault: string) => {
      if (!address) {
        return null;
      }

      return await api.call({
        target: address,
        abi: abi.getVaultEntireData,
        params: [vault],
      });
    },
  };
};

const config = {
  liquidity: "0x52aa899454998be5b000ad077a46bbe360f4e497",
  ethereum: {
    dataStartTimestamp: 1708246655, // ~ when liquidity resolver was deployed

    revenueResolverExistAfterBlock: 19959852,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1708931052,
    vaultResolverExistAfterBlock: 19313700,
  },
  arbitrum: {
    dataStartTimestamp: 1718020611, // ~ when liquidity resolver was deployed (block 220375236)

    revenueResolverExistAfterBlock: 0,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 0,
    vaultResolverExistAfterBlock: 0,
  },
};

const methodologyFluid = {
  Fees: "Interest paid by borrowers",
  Revenue: "Percentage of interest going to treasury",
};

const fetch: FetchV2 = async ({ api, fromTimestamp, toTimestamp }) => {
  return {
    // totalFees: await getFeesFromTo(
    //   api,
    //   config[api.chain].dataStartTimestamp,
    //   toTimestamp
    // ),
    dailyFees: await getFeesFromTo(api, fromTimestamp, toTimestamp),
    // totalRevenue: await getRevenueFromTo(
    //   api,
    //   config[api.chain].dataStartTimestamp,
    //   toTimestamp
    // ),
    dailyRevenue: await getRevenueFromTo(api, fromTimestamp, toTimestamp),
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
  },
};

export default adapter;

const getFeesFromTo = async (
  api: sdk.ChainApi,
  fromTimestamp: number,
  toTimestamp: number
): Promise<number> => {
  let fromBlock = (await getBlock(api.chain, fromTimestamp)).number;
  const toBlock = (await getBlock(api.chain, toTimestamp)).number;

  if (fromTimestamp < config[api.chain].vaultResolverExistAfterTimestamp) {
    fromTimestamp = config[api.chain].vaultResolverExistAfterTimestamp;
    fromBlock = config[api.chain].vaultResolverExistAfterBlock;
  }
  if (fromTimestamp >= toTimestamp) {
    return 0;
  }

  const liquidityOperateLogs = (await sdk.getEventLogs({
    target: config.liquidity,
    fromBlock,
    toBlock,
    chain: api.chain,
    onlyArgs: true,
    eventAbi:
      "event LogOperate(address indexed user,address indexed token,int256 supplyAmount,int256 borrowAmount,address withdrawTo,address borrowTo,uint256 totalAmounts,uint256 exchangePricesAndConfig)",
  })) as any[];

  const fromApi = new sdk.ChainApi({
    chain: api.chain,
    block: fromBlock,
  });
  const toApi = new sdk.ChainApi({
    chain: api.chain,
    block: toBlock,
  });
  const vaults: string[] = await (
    await vaultResolver(toApi)
  ).getAllVaultsAddresses();

  for await (const vault of vaults) {
    let borrowBalance = new BigNumber(0);
    let borrowToken = "";
    try {
      const { constantVariables, totalSupplyAndBorrow } = await (
        await vaultResolver(fromApi)
      ).getVaultEntireData(vault);

      borrowToken = constantVariables.borrowToken;
      borrowBalance = new BigNumber(totalSupplyAndBorrow.totalBorrowVault);
    } catch (ex) {
      // when vault did not exist yet, getVaultEntireData() will revert. at from block then we start from 0 balance.
    }

    if (!borrowToken) {
      const { borrowToken: vaultBorrowToken } = await toApi.call({
        target: vault,
        abi: abis.vault.constantsView,
      });
      borrowToken = vaultBorrowToken;
    }

    // get block numbers where an update to vault borrow amounts happened + start block and end block
    let vaultOperates = liquidityOperateLogs.filter(
      (x) =>
        x[0] == vault && // filter user must be vault
        x[1] == borrowToken // filter token must be vault borrow token (ignore supply / withdraw)
    );

    for await (const vaultOperate of vaultOperates) {
      borrowBalance = borrowBalance.plus(new BigNumber(vaultOperate[3]));
    }

    try {
      const { totalSupplyAndBorrow: totalSupplyAndBorrowTo } = await (
        await vaultResolver(toApi)
      ).getVaultEntireData(vault);

      toApi.addToken(
        borrowToken,
        new BigNumber(totalSupplyAndBorrowTo.totalBorrowVault).minus(
          borrowBalance
        )
      );
    } catch (ex) {
      // when vault is deployed but not fully configured yet, getVaultEntireData() will revert at the used version of VaultResolver.
      // totalBorrow is still 0 at that point.
    }
  }

  return await toApi.getUSDValue();
};

const getRevenueFromTo = async (
  api: sdk.ChainApi,
  fromTimestamp: number,
  toTimestamp: number
): Promise<number> => {
  return (
    (await getLiquidityRevenueFromTo(api, fromTimestamp, toTimestamp)) +
    (await getVaultsMagnifierRevenueFromTo(api, fromTimestamp, toTimestamp))
  );
};

const getLiquidityRevenueFromTo = async (
  api: sdk.ChainApi,
  fromTimestamp: number,
  toTimestamp: number
) => {
  const tokens: string[] = await (await liquidityResolver(api)).listedTokens();

  const collectRevenueLogs: [string, BigNumber][] = (await sdk.getEventLogs({
    target: config.liquidity,
    fromBlock: (await getBlock(api.chain, fromTimestamp)).number,
    toBlock: (await getBlock(api.chain, toTimestamp)).number,
    chain: api.chain,
    onlyArgs: true,
    eventAbi:
      "event LogCollectRevenue(address indexed token, uint256 indexed amount)",
  })) as [string, BigNumber][];

  const balancesApi = new sdk.ChainApi({
    block: await api.getBlock(),
    chain: api.chain,
  });

  for await (const token of tokens) {
    const revenueFrom = await getLiquidityUncollectedRevenueAt(
      api,
      fromTimestamp,
      token
    );
    let revenueTo = await getLiquidityUncollectedRevenueAt(
      api,
      toTimestamp,
      token
    );

    // consider case where collect revenue has been executed in the time frame
    const logs = collectRevenueLogs.filter((x) => x[0] == token);
    const collectedRevenue: BigNumber = logs.reduce((sum: BigNumber, x) => {
      return sum.plus(x[1]);
    }, new BigNumber(0));

    // add collected revenue in time frame to the to time point revenue.
    // to revenue = uncollected at that point + all collected revenue since from
    revenueTo = revenueTo.plus(collectedRevenue);

    // get uncollected revenue in from -> to timespan
    balancesApi.add(
      token,
      revenueTo.gt(revenueFrom)
        ? revenueTo.minus(revenueFrom)
        : new BigNumber(0)
    );
  }

  return await balancesApi.getUSDValue();
};

const getLiquidityUncollectedRevenueAt = async (
  api: sdk.ChainApi,
  timestamp: number,
  token: string
) => {
  const timestampedApi = new sdk.ChainApi({
    chain: api.chain,
    block: (await getBlock(api.chain, timestamp)).number,
  });

  // check if token was listed at that timestamp at Liquidity, if not, revenue is 0
  if (
    !(
      (await (
        await liquidityResolver(timestampedApi)
      ).listedTokens()) as string[]
    ).includes(token)
  ) {
    return new BigNumber(0);
  }

  // get liquidity packed storage slots data at timestamped Api block number
  const totalAmounts = await (
    await liquidityResolver(timestampedApi)
  ).getTotalAmounts(token);

  const exchangePricesAndConfig = await (
    await liquidityResolver(timestampedApi)
  ).getExchangePricesAndConfig(token);

  let liquidityTokenBalance: BigNumber | string;
  if (token.toLowerCase() == "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    liquidityTokenBalance = (
      await sdk.api.eth.getBalance({
        target: config.liquidity,
        block: await timestampedApi.getBlock(),
      })
    ).output;
  } else {
    liquidityTokenBalance = await timestampedApi.call({
      target: token,
      abi: "erc20:balanceOf",
      params: [config.liquidity],
    });
  }

  // pass data into revenue resolver, available at current api block, which calculates revenue at the
  // simulated timestamp based on storage slots data
  const uncollectedRevenue = await (
    await revenueResolver(
      new sdk.ChainApi({
        chain: api.chain,
        block: config[api.chain].revenueResolverExistAfterBlock,
      })
    )
  )?.calcRevenueSimulatedTime(
    totalAmounts,
    exchangePricesAndConfig,
    liquidityTokenBalance,
    timestamp
  );

  return new BigNumber(uncollectedRevenue);
};

const getVaultsMagnifierRevenueFromTo = async (
  api: sdk.ChainApi,
  fromTimestamp: number,
  toTimestamp: number
) => {
  if (toTimestamp < config[api.chain].vaultResolverExistAfterTimestamp) {
    return 0;
  }

  let fromBalancesApi = new sdk.ChainApi({
    block: await api.getBlock(),
    chain: api.chain,
  });

  let toBalancesApi = new sdk.ChainApi({
    block: (await getBlock(api.chain, toTimestamp)).number,
    chain: api.chain,
  });

  const vaults: string[] = await (
    await vaultResolver(toBalancesApi)
  ).getAllVaultsAddresses();

  for await (const vault of vaults) {
    fromBalancesApi = await getVaultMagnifierUncollectedRevenueAt(
      api,
      fromTimestamp,
      vault,
      fromBalancesApi
    );

    toBalancesApi = await getVaultMagnifierUncollectedRevenueAt(
      api,
      toTimestamp,
      vault,
      toBalancesApi
    );

    // add collected revenue in time frame to the to time point revenue.
    // to revenue = uncollected at that point + all collected revenue since from
    toBalancesApi = await getVaultMagnifierCollectedRevenueFromTo(
      api,
      vault,
      fromTimestamp,
      toTimestamp,
      toBalancesApi
    );
  }

  const revenueFrom = await fromBalancesApi.getUSDValue();
  const revenueTo = await toBalancesApi.getUSDValue();

  return revenueTo > revenueFrom ? revenueTo - revenueFrom : 0;
};

const getVaultMagnifierCollectedRevenueFromTo = async (
  api: sdk.ChainApi,
  vault: string,
  fromTimestamp: number,
  toTimestamp: number,
  balancesApi: sdk.ChainApi
) => {
  const rebalanceEventLogs: { colAmt: BigNumber; debtAmt: BigNumber }[] = (
    (await sdk.getEventLogs({
      target: vault,
      fromBlock: (await getBlock(api.chain, fromTimestamp)).number,
      toBlock: (await getBlock(api.chain, toTimestamp)).number,
      chain: api.chain,
      onlyArgs: true,
      eventAbi:
        /// @notice emitted when a `rebalance()` has been executed, balancing out total supply / borrow between Vault
        /// and Fluid Liquidity pools.
        /// if `colAmt_` is negative then profit, meaning withdrawn from vault and sent to rebalancer address.
        /// if `debtAmt_` is positive then profit, meaning borrow from vault and sent to rebalancer address.
        "event LogRebalance(int colAmt_, int debtAmt_)",
    })) as [BigInt, BigInt][]
  ).map((x) => ({
    colAmt: new BigNumber(x[0].toString()),
    debtAmt: new BigNumber(x[1].toString()),
  }));

  if (rebalanceEventLogs.length == 0) {
    return balancesApi;
  }

  // get collateral and borrow token of the vault
  const { supplyToken, borrowToken } = await api.call({
    target: vault,
    abi: abis.vault.constantsView,
  });

  for await (const log of rebalanceEventLogs) {
    if (log.colAmt.isNegative()) {
      // add collateral token amount to balances
      balancesApi.addToken(supplyToken, log.colAmt.absoluteValue());
    }
    if (log.debtAmt.isPositive()) {
      // add borrow token amount to balances
      balancesApi.addToken(borrowToken, log.debtAmt);
    }
  }

  return balancesApi;
};

const getVaultMagnifierUncollectedRevenueAt = async (
  api: sdk.ChainApi,
  timestamp: number,
  vault: string,
  balancesApi: sdk.ChainApi
) => {
  if (timestamp < config[api.chain].vaultResolverExistAfterTimestamp) {
    // vault resolver related revenue only exists after this timestamp. before this there has been no such revenue.
    return balancesApi;
  }

  const targetBlock = (await getBlock(api.chain, timestamp)).number;

  const timestampedApi = new sdk.ChainApi({
    chain: api.chain,
    block: targetBlock,
  });

  try {
    const { totalSupplyAndBorrow, constantVariables } = await (
      await vaultResolver(timestampedApi)
    ).getVaultEntireData(vault);

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

    balancesApi.add(constantVariables.supplyToken, supplyTokenProfit);
    balancesApi.add(constantVariables.borrowToken, borrowTokenProfit);
  } catch (ex) {
    // when vault did not exist yet, getVaultEntireData() will revert. there is no uncollected revenue at that point.
  }

  return balancesApi;
};
