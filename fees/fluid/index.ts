import * as sdk from "@defillama/sdk";
import { getBlock } from "@defillama/sdk/build/util/blocks";
import BigNumber from "bignumber.js";
import { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fluidLiquidity = "0x52aa899454998be5b000ad077a46bbe360f4e497";

const fluidRevenueResolverExistAfterBlock = 19784319;
const fluidRevenueResolver = "0x0F683159f14857D61544650607549Cdc21abE774";
const fluidRevenueResolverAbi = {
  calcRevenueSimulatedTime:
    "function calcRevenueSimulatedTime(uint256 totalAmounts_,uint256 exchangePricesAndConfig_,uint256 liquidityTokenBalance_,uint256 simulatedTimestamp_) public view returns (uint256 revenueAmount_)",
  getRevenue:
    "function getRevenue(address token_) public view returns (uint256 revenueAmount_)",
};

const fluidLiquidityResolver = "0x741c2Cd25f053a55fd94afF1afAEf146523E1249";
const fluidLiquidityResolverAbi = {
  listedTokens:
    "function listedTokens() public view returns (address[] listedTokens_)",
  getExchangePricesAndConfig:
    "function getExchangePricesAndConfig(address token_) public view returns (uint256)",
  getTotalAmounts:
    "function getTotalAmounts(address token_) public view returns (uint256)",
};

// up until block 19662786, must use historical resolver as new one had not been deployed yet
const vaultResolverExistAfterTimestamp = 1708931052; // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
const vaultResolverExistAfterBlock = 19313700; // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
const vaultResolverHistoricalBlock = 19662786;
const fluidVaultResolverHistorical =
  "0x8DD65DaDb217f73A94Efb903EB2dc7B49D97ECca";
const fluidVaultResolver = "0x93CAB6529aD849b2583EBAe32D13817A2F38cEb4";
const fluidVaultResolverAbi = {
  getAllVaultsAddresses:
    "function getAllVaultsAddresses() external view returns (address[] vaults_)",
  getVaultEntireData:
    "function getVaultEntireData(address vault_) view returns ((address vault, (address liquidity, address factory, address adminImplementation, address secondaryImplementation, address supplyToken, address borrowToken, uint8 supplyDecimals, uint8 borrowDecimals, uint256 vaultId, bytes32 liquiditySupplyExchangePriceSlot, bytes32 liquidityBorrowExchangePriceSlot, bytes32 liquidityUserSupplySlot, bytes32 liquidityUserBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePrice, address rebalancer) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateVault, uint256 borrowRateVault, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, uint256 rewardsRate) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidity, uint256 totalBorrowLiquidity, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable) liquidityUserBorrowData) vaultData_)",
};
const fluidVaultResolverTarget = async (api: sdk.ChainApi) => {
  return (await api.getBlock()) > vaultResolverHistoricalBlock
    ? fluidVaultResolver
    : fluidVaultResolverHistorical;
};

const fluidVaultAbi = {
  constantsView:
    "function constantsView() public view returns((address liquidity,address factory,address adminImplementation,address secondaryImplementation,address supplyToken,address borrowToken,uint8 supplyDecimals,uint8 borrowDecimals,uint vaultId,bytes32 liquiditySupplyExchangePriceSlot,bytes32 liquidityBorrowExchangePriceSlot,bytes32 liquidityUserSupplySlot,bytes32 liquidityUserBorrowSlot))",
};

const methodologyFluid = {
  Fees: "Interest paid by borrowers",
  Revenue: "Percentage of interest going to treasury",
};

const dataStartTimestamp = 1708246655; // ~ when liquidity resolver was deployed

const fetch: FetchV2 = async ({ api, fromTimestamp, toTimestamp }) => {
  return {
    // totalFees: await getFeesFromTo(api, dataStartTimestamp, toTimestamp),
    dailyFees: await getFeesFromTo(api, fromTimestamp, toTimestamp),
    // totalRevenue: await getRevenueFromTo(api, dataStartTimestamp, toTimestamp),
    dailyRevenue: await getRevenueFromTo(api, fromTimestamp, toTimestamp),
  };
};
const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: dataStartTimestamp,
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

  if (fromTimestamp < vaultResolverExistAfterTimestamp) {
    fromTimestamp = vaultResolverExistAfterTimestamp;
    fromBlock = vaultResolverExistAfterBlock;
  }
  if (fromTimestamp >= toTimestamp) {
    return 0;
  }

  const liquidityOperateLogs = (await sdk.getEventLogs({
    target: fluidLiquidity,
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
  const vaults: string[] = await toApi.call({
    target: await fluidVaultResolverTarget(toApi),
    abi: fluidVaultResolverAbi.getAllVaultsAddresses,
  });

  for await (const vault of vaults) {
    let borrowBalance = new BigNumber(0);
    let borrowToken = "";
    try {
      const { constantVariables, totalSupplyAndBorrow } = await fromApi.call({
        target: await fluidVaultResolverTarget(fromApi),
        abi: fluidVaultResolverAbi.getVaultEntireData,
        params: [vault],
      });

      borrowToken = constantVariables.borrowToken;
      borrowBalance = new BigNumber(totalSupplyAndBorrow.totalBorrowVault);
    } catch (ex) {
      // when vault did not exist yet, getVaultEntireData() will revert. at from block then we start from 0 balance.
    }

    if (!borrowToken) {
      const { borrowToken: vaultBorrowToken } = await toApi.call({
        target: vault,
        abi: fluidVaultAbi.constantsView,
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

    const { totalSupplyAndBorrow: totalSupplyAndBorrowTo } = await toApi.call({
      target: await fluidVaultResolverTarget(toApi),
      abi: fluidVaultResolverAbi.getVaultEntireData,
      params: [vault],
    });

    toApi.addToken(
      borrowToken,
      new BigNumber(totalSupplyAndBorrowTo.totalBorrowVault).minus(
        borrowBalance
      )
    );
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
  const tokens: string[] = await api.call({
    target: fluidLiquidityResolver,
    abi: fluidLiquidityResolverAbi.listedTokens,
  });

  const collectRevenueLogs: [string, BigNumber][] = (await sdk.getEventLogs({
    target: fluidLiquidity,
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
      (await timestampedApi.call({
        target: fluidLiquidityResolver,
        abi: fluidLiquidityResolverAbi.listedTokens,
      })) as string[]
    ).includes(token)
  ) {
    return new BigNumber(0);
  }

  // get liquidity packed storage slots data at timestamped Api block number
  const totalAmounts = await timestampedApi.call({
    target: fluidLiquidityResolver,
    abi: fluidLiquidityResolverAbi.getTotalAmounts,
    params: [token],
  });
  const exchangePricesAndConfig = await timestampedApi.call({
    target: fluidLiquidityResolver,
    abi: fluidLiquidityResolverAbi.getExchangePricesAndConfig,
    params: [token],
  });
  let liquidityTokenBalance: BigNumber | string;
  if (token.toLowerCase() == "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    liquidityTokenBalance = (
      await sdk.api.eth.getBalance({
        target: fluidLiquidity,
        block: await timestampedApi.getBlock(),
      })
    ).output;
  } else {
    liquidityTokenBalance = await timestampedApi.call({
      target: token,
      abi: "erc20:balanceOf",
      params: [fluidLiquidity],
    });
  }

  // pass data into revenue resolver, available at current api block, which calculates revenue at the
  // simulated timestamp based on storage slots data

  const uncollectedRevenue = await new sdk.ChainApi({
    chain: api.chain,
    block: fluidRevenueResolverExistAfterBlock,
  }).call({
    target: fluidRevenueResolver,
    abi: fluidRevenueResolverAbi.calcRevenueSimulatedTime,
    params: [
      totalAmounts,
      exchangePricesAndConfig,
      liquidityTokenBalance,
      timestamp,
    ],
  });

  return new BigNumber(uncollectedRevenue);
};

const getVaultsMagnifierRevenueFromTo = async (
  api: sdk.ChainApi,
  fromTimestamp: number,
  toTimestamp: number
) => {
  if (toTimestamp < vaultResolverExistAfterTimestamp) {
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

  const vaults: string[] = await toBalancesApi.call({
    target: await fluidVaultResolverTarget(toBalancesApi),
    abi: fluidVaultResolverAbi.getAllVaultsAddresses,
  });

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
    abi: fluidVaultAbi.constantsView,
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
  if (timestamp < vaultResolverExistAfterTimestamp) {
    // vault resolver related revenue only exists after this timestamp. before this there has been no such revenue.
    return balancesApi;
  }

  const targetBlock = (await getBlock(api.chain, timestamp)).number;

  const timestampedApi = new sdk.ChainApi({
    chain: api.chain,
    block: targetBlock,
  });

  try {
    const { totalSupplyAndBorrow, constantVariables } =
      await timestampedApi.call({
        target: await fluidVaultResolverTarget(timestampedApi),
        abi: fluidVaultResolverAbi.getVaultEntireData,
        params: [vault],
      });

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
