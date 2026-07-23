import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VAULT = "0xE0d3cC7cdDBbFeD0CEdFEB22c6D08e392CD9DA1A";

// Known liquid staking pool addresses (manually mapped from documentation)
const KNOWN_LIQUID_STAKING_POOLS = [
  '0x17df9c605574b99867fde32e69cf0a2c8e7e70c9', // LeverageStaking
  '0x267b19d608fd0fff4d533f56d750590bc85293ba', // LeverageStaking ETF
  '0x92344754a9060a52A634B3c6b8118f76baD1A448', // LeverageStaking Production
  '0xf5361c4912bc0ef983bef26342aca525b0812085', // 3x ETH Staking ETF
].map(a => a.toLowerCase());

// Keywords for pools not in the known list
const LIQUID_STAKING_KEYWORDS = ['leverage', 'staking', 'eth', '3x'];

const fetch = async ({
  api,
  createBalances,
  getFromBlock,
  getToBlock,
}: FetchOptions) => {
  const dailyRevenue = createBalances(); // Manager claim fees
  const dailySupplySideRevenue = createBalances(); // Yield for users

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  const managerClaimTopic = '0x1bf0129823b56213a46996bc874ce50b318995cae2bbdcd2000933d36012547d';

  const managerClaims = await api.getLogs({
    target: VAULT,
    topic: managerClaimTopic,
    fromBlock,
    toBlock,
  });

  if (managerClaims.length === 0) {
    const dailyFees = createBalances();
    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
    };
  }

  // Get unique pool addresses
  const poolAddresses = [...new Set(managerClaims.map(log =>
    '0x' + log.topics[2].slice(26)
  ))];

  // Query names and symbols for pools not in known list
  const names = await api.multiCall({
    abi: 'function name() view returns (string)',
    calls: poolAddresses.map(pool => ({ target: pool })),
    permitFailure: true
  });

  const symbols = await api.multiCall({
    abi: 'function symbol() view returns (string)',
    calls: poolAddresses.map(pool => ({ target: pool })),
    permitFailure: true
  });

  // Identify liquid staking pools
  const liquidStakingPools = new Set<string>();

  poolAddresses.forEach((pool, i) => {
    const poolLower = pool.toLowerCase();

    // First check if it's a known pool
    if (KNOWN_LIQUID_STAKING_POOLS.includes(poolLower)) {
      liquidStakingPools.add(poolLower);
      return;
    }

    // Otherwise check by name/symbol keywords
    const name = (names[i] || '').toLowerCase();
    const symbol = (symbols[i] || '').toLowerCase();
    const combined = `${name} ${symbol}`;

    const isLiquidStaking = LIQUID_STAKING_KEYWORDS.some(keyword =>
      combined.includes(keyword)
    );

    if (isLiquidStaking) {
      liquidStakingPools.add(poolLower);
    }
  });

  // Process manager claim logs - add to revenue
  for (const log of managerClaims) {
    const pool = ('0x' + log.topics[2].slice(26)).toLowerCase();

    if (liquidStakingPools.has(pool)) {
      const token = '0x' + log.data.slice(26, 66);
      const amount = '0x' + log.data.slice(66, 130);
      dailyRevenue.add(token.toLowerCase(), amount);
    }
  }

  // ===== SUPPLY-SIDE REVENUE (Staking Yields) =====
  // Calculate yield from pool balance changes
  // Get all tokens that were involved in manager claims
  const tokensSet = new Set<string>();
  for (const log of managerClaims) {
    const token = ('0x' + log.data.slice(26, 66)).toLowerCase();
    tokensSet.add(token);
  }
  const tokens = Array.from(tokensSet);

  // For each liquid staking pool, calculate balance changes to estimate staking yield
  for (const pool of Array.from(liquidStakingPools)) {
    // Get balance at start block
    const startBalances = await api.multiCall({
      abi: 'function balanceOf(address account) view returns (uint256)',
      calls: tokens.map(token => ({
        target: token,
        params: [pool],
      })),
      block: fromBlock,
      permitFailure: true,
    });

    // Get balance at end block
    const endBalances = await api.multiCall({
      abi: 'function balanceOf(address account) view returns (uint256)',
      calls: tokens.map(token => ({
        target: token,
        params: [pool],
      })),
      block: toBlock,
      permitFailure: true,
    });

    // Calculate net transfers (inflows - outflows) for this pool
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // ERC20 Transfer

    // Transfers TO the pool (inflows/deposits)
    const inflowLogs = await api.getLogs({
      topic: transferTopic,
      topics: [null, null, pool],
      fromBlock,
      toBlock,
    });

    // Transfers FROM the pool (outflows/withdrawals)
    const outflowLogs = await api.getLogs({
      topic: transferTopic,
      topics: [null, pool, null],
      fromBlock,
      toBlock,
    });

    // Calculate net inflows by token
    const netInflows: { [token: string]: bigint } = {};
    for (const token of tokens) {
      netInflows[token.toLowerCase()] = 0n;
    }

    for (const log of inflowLogs) {
      const token = log.address.toLowerCase();
      const amount = BigInt(log.data || 0);
      if (netInflows[token] !== undefined) {
        netInflows[token] += amount;
      }
    }

    for (const log of outflowLogs) {
      const token = log.address.toLowerCase();
      const amount = BigInt(log.data || 0);
      if (netInflows[token] !== undefined) {
        netInflows[token] -= amount;
      }
    }

    // Calculate yield: (End Balance - Start Balance) - Net Inflows
    // If result is positive, it represents staking yield earned by the pool
    tokens.forEach((token, index) => {
      const tokenLower = token.toLowerCase();
      const startBalance = BigInt(startBalances[index] || 0);
      const endBalance = BigInt(endBalances[index] || 0);
      const balanceChange = endBalance - startBalance;
      const netInflow = netInflows[tokenLower] || 0n;

      // Yield = Balance Change - Net Inflows
      const yield_ = balanceChange - netInflow;

      if (yield_ > 0n) {
        dailySupplySideRevenue.add(tokenLower, yield_.toString());
      }
    });
  }

  // ===== CALCULATE TOTAL FEES =====
  // Fees = Revenue + SupplySideRevenue
  const dailyFees = dailyRevenue;
  
  // Add supply-side revenue to daily fees
  const supplySideObj = dailySupplySideRevenue as any;
  if (supplySideObj && typeof supplySideObj.toObject === 'function') {
    const supplySideTokens = supplySideObj.toObject();
    for (const [token, amount] of Object.entries(supplySideTokens)) {
      dailyFees.add(token, amount as string);
    }
  }

  return {
    dailyFees, // Total fees = Revenue + SupplySideRevenue
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1673913600,
    },
  },
  methodology: {
    Fees: "Total fees = Revenue + SupplySideRevenue. Represents all revenue generated by Desyn liquid staking pools",
    Revenue: "Manager claim fees collected by the protocol from liquid staking pools (LeverageStaking, 3x ETH Staking ETF, LeverageStaking Production)",
    SupplySideRevenue: "Staking yield earned by liquidity providers from 3x leverage staking strategies, calculated as: (Ending Pool Balance - Starting Pool Balance) - Net Inflows. This captures the gains from leveraged ETH staking",
  },
};

export default adapter;