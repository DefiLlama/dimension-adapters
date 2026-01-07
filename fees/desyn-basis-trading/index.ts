import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VAULT = "0xE0d3cC7cdDBbFeD0CEdFEB22c6D08e392CD9DA1A";

// Known basis trading pool addresses
const KNOWN_BASIS_TRADING_POOLS = [
  '0xcf7190732ca52167a51debf2cef62f8492a23a3d', // DTBT
  '0x8c174bfa28390719fedf68df79ffdc15da60617d', // TBill
  '0x5b54fa836a7ba94c8b8a18feb96222216e1452ff0', // dSTBT-Test
  '0x52e68ae1038fde626db5cebce8df61d733e96e5e', // TBill production
  '0x6b2c42d2aa4cb2d859cf7a88546db12ae294f303', // dSTBT production
].map(a => a.toLowerCase());

const BASIS_TRADING_KEYWORDS = ['tbill', 'treasury', 'dtbt', 'dstbt', 'stbt', 'bond', 'value', 'classic'];

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

  // ===== MANAGER CLAIM FEES (Protocol Revenue) =====
  const managerClaimTopic = '0x1bf0129823b56213a46996bc874ce50b318995cae2bbdcd2000933d36012547d';

  const managerClaims = await api.getLogs({
    target: VAULT,
    topic: managerClaimTopic,
    fromBlock,
    toBlock,
  });

  if (managerClaims.length === 0) {
    return {
      dailyFees: dailyRevenue,
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

  // Identify basis trading pools
  const basisTradingPools = new Set<string>();

  poolAddresses.forEach((pool, i) => {
    const poolLower = pool.toLowerCase();

    // First check if it's a known pool
    if (KNOWN_BASIS_TRADING_POOLS.includes(poolLower)) {
      basisTradingPools.add(poolLower);
      return;
    }

    // Otherwise check by name/symbol keywords
    const name = (names[i] || '').toLowerCase();
    const symbol = (symbols[i] || '').toLowerCase();
    const combined = `${name} ${symbol}`;

    const isBasisTrading = BASIS_TRADING_KEYWORDS.some(keyword =>
      combined.includes(keyword)
    );

    if (isBasisTrading) {
      basisTradingPools.add(poolLower);
    }
  });

  // Process manager claim logs - add to revenue
  for (const log of managerClaims) {
    const pool = ('0x' + log.topics[2].slice(26)).toLowerCase();

    if (basisTradingPools.has(pool)) {
      const token = '0x' + log.data.slice(26, 66);
      const amount = '0x' + log.data.slice(66, 130);
      dailyRevenue.add(token.toLowerCase(), amount);
    }
  }

  // ===== SUPPLY-SIDE REVENUE (User Yields) =====
  // Calculate yield from pool balance changes
  // Get all tokens that were involved in manager claims
  const tokensSet = new Set<string>();
  for (const log of managerClaims) {
    const token = ('0x' + log.data.slice(26, 66)).toLowerCase();
    tokensSet.add(token);
  }
  const tokens = Array.from(tokensSet);

  // For each basis trading pool, calculate balance changes to estimate yield
  for (const pool of Array.from(basisTradingPools)) {
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

    // Transfers TO the pool (inflows)
    const inflowLogs = await api.getLogs({
      topic: transferTopic,
      topics: [null, null, pool],
      fromBlock,
      toBlock,
    });

    // Transfers FROM the pool (outflows)
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
    // If result is positive, it represents yield earned by the pool
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

  return {
    dailyFees: dailyRevenue, // For backward compatibility
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
    Fees: "Total fees = Revenue + SupplySideRevenue. Represents all revenue generated by Desyn basis trading pools",
    Revenue: "Manager claim fees collected by the protocol from basis trading pools (DTBT, TBill, dSTBT, Value Classic Fund)",
    SupplySideRevenue: "Yield earned by liquidity providers, calculated as: (Ending Pool Balance - Starting Pool Balance) - Net Inflows. This captures the gains from basis trading strategies and treasury bill yields",
  },
};

export default adapter;