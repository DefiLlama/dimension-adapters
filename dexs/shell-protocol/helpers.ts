import { POOL_DATA, POOL_DATA_V3, TOKEN_NAMES, MAINNET_SUBGRAPH_URL, MAINNET_V3_SUBGRAPH_URL, COIN_GECKO_IDS, MAINNET_BLOCKS_URL } from "./constants.ts";

function defineComputesQuery(poolAddress: string, timestamp: number, endTimestamp: number, inputLastId: string, outputLastId: string): string {
  let computesQuery = "";
  if (inputLastId !== "-1") {
    computesQuery += `computeInputAmounts (where:{externalContract: "${poolAddress}", timestamp_gte: ${timestamp}, timestamp_lte: ${endTimestamp}, id_gt: ${inputLastId}}, first: 1000){ id inputToken inputAmount outputToken outputAmount timestamp}`;
  }
  if (outputLastId !== "-1") {
    computesQuery += `computeOutputAmounts (where:{externalContract: "${poolAddress}", timestamp_gte: ${timestamp}, timestamp_lte: ${endTimestamp}, id_gt: ${outputLastId}}, first: 1000){ id inputToken inputAmount outputToken outputAmount timestamp}`;
  }
  return `{${computesQuery}}`;
}

function definePoolBalancesQuery(poolAddress: string, oceanId: string, blockNumber: number): string {
  return `
      {
          user (id: "${poolAddress}", block: {number: ${blockNumber}}){
              id
              userBalances {
                oceanId
                balance
              }
          }
          oceanToken (id: "${oceanId}", block: {number: ${blockNumber}}){
            supply
          }
      }
      `;
}

async function getPrices(chain: string): Promise<{ [key: string]: { usd: number } }> {
  let prices: { [key: string]: { usd: number } } = {};

  try {
    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-cg-demo-api-key": "CG-DfuTtr6HEjL8t2eD6MpyeLp5",
      },
    };

    prices = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COIN_GECKO_IDS)}&vs_currencies=usd`, options).then((response) =>
      response.json()
    );

    const tokenBalancesTOUCOIN = await getTokenBalance(chain, "TOUCOIN+ETH");
    if (tokenBalancesTOUCOIN) {
      prices["government-toucans"] = {
        usd: (tokenBalancesTOUCOIN["ETH"] / tokenBalancesTOUCOIN["TOUCOIN"]) * prices.ethereum.usd,
      };
    }

    const tokenBalancesSHELL = await getTokenBalance(chain, "SHELL+ETH", "v3");
    if (tokenBalancesSHELL) {
      prices["shSHELL"] = {
        usd: (tokenBalancesSHELL["ETH"] / tokenBalancesSHELL["SHELL"]) * prices.ethereum.usd,
      };
    }
  } catch (error) {
    console.error("Error fetching prices:", error);
  }

  return prices;
}

async function getCurveAnalytics(chain: string, prices: { [key: string]: { usd: number } }, externalPoolData: { registryId: string; address: string }) {
  const output: any = {};

  const curveApiCallData = await fetch(`https://api.curve.finance/api/getPools/arbitrum/${externalPoolData.registryId}`).then((response) => response.json());
  const curveApiCall = curveApiCallData.data.poolData;

  for (const pool of curveApiCall) {
    if (pool.address === externalPoolData.address) {
      output.totalValueLocked = parseFloat(pool.usdTotal);
      output.LPTokenPrice = parseFloat(pool.virtualPrice) / 1e18;
      output.LPTokenBalance = parseFloat(pool.totalSupply) / 1e18;

      output.balances = {};
      output.breakdown = {};

      for (const coin of pool.coins) {
        const balance = parseFloat(coin.poolBalance) / Math.pow(10, parseInt(coin.decimals));
        const breakdown = Math.round(((balance * coin.usdPrice) / parseFloat(pool.usdTotal)) * 100);

        if (POOL_DATA_V3[chain][coin.symbol]) {
          const poolTokenBalance = await getCurveAnalytics(chain, prices, POOL_DATA_V3[chain][coin.symbol].externalPoolData);
          prices[coin.symbol] = { usd: poolTokenBalance.LPTokenPrice };
          for (const token in poolTokenBalance.breakdown) {
            output.balances[token] = (balance * poolTokenBalance.breakdown[token]) / 100;
            output.breakdown[token] = Math.round((breakdown * poolTokenBalance.breakdown[token]) / 100);
          }
        } else {
          output.balances[coin.symbol] = balance;
          output.breakdown[coin.symbol] = breakdown;
        }
      }
    }
  }

  return output;
}

async function getBalancerAnalytics(chain: string, poolName: string, externalPoolData: { poolId: string }, ethPrice: number) {
  const output: any = {};
  const apiCallData = await fetch(`https://api.balancer.fi/pools/42161/${externalPoolData.poolId}`).then((response) => response.json());

  output.totalValueLocked = parseFloat(apiCallData.totalLiquidity);
  output.LPTokenPrice = 0;
  output.LPTokenBalance = parseFloat(apiCallData.totalShares);
  output.breakdown = {};
  output.balances = {};

  for (const token of apiCallData.tokens) {
    if (poolName === token.symbol || token.token.pool) {
      output.LPTokenPrice = parseFloat(token.token.latestUSDPrice);
      continue;
    }
    output.balances[token.symbol] = parseFloat(token.balance);
    output.breakdown[token.symbol] = Math.round(((output.balances[token.symbol] * parseFloat(token.priceRate) * ethPrice) / output.totalValueLocked) * 100);
  }

  return output;
}

async function getPoolData(
  chain: string,
  poolName: string,
  prices: { [key: string]: { usd: number } },
  version: string,
  startTime: number,
  endTime: number
): Promise<{
  totalValueLocked: number;
  LPTokenPrice: number;
  LPTokenBalance: number;
  breakdown: { [key: string]: number };
  balances: { [key: string]: number };
  "24HrVolume": number;
}> {
  let pool = version === "v3" ? POOL_DATA_V3[chain][poolName] : POOL_DATA[chain][poolName];

  let totalValueLocked: number = 0;
  let LPTokenPrice: number = 0;
  let LPTokenBalance: number = 0;
  let breakdown: { [key: string]: number } = {};
  let balances: { [key: string]: number } = {};
  let volume: number = 0;

  let subTokenPrices: { [key: string]: number } = {};
  let fractalPoolData: { [key: string]: any } = {};

  if (pool.type !== "Shell") {
    if (pool.type == "Curve") {
      const output = await getCurveAnalytics(chain, prices, pool.externalPoolData);

      totalValueLocked = output.totalValueLocked;
      LPTokenPrice = output.LPTokenPrice;
      LPTokenBalance = output.LPTokenBalance;
      breakdown = output.breakdown;
      balances = output.balances;
    } else if (pool.type == "Balancer") {
      const output = await getBalancerAnalytics(chain, poolName, pool.externalPoolData, prices[COIN_GECKO_IDS["ETH"]]["usd"]);

      totalValueLocked = output.totalValueLocked;
      LPTokenPrice = output.LPTokenPrice;
      LPTokenBalance = output.LPTokenBalance;
      breakdown = output.breakdown;
      balances = output.balances;
    } else if (pool.type == "Aave") {
      prices[poolName] = prices[(Object.values(pool.tokens)[0] as any).name];
    } else if (pool.type == "Pendle") {
      const marketData = await fetch(`https://api-v2.pendle.finance/core/v1/42161/markets/${pool.externalPoolData.metadata}`).then((response) =>
        response.json()
      );
      prices[poolName] = poolName.startsWith("PT-") ? marketData.pt.price.usd : marketData.yt.price.usd;
    } else if (pool.type == "Beefy") {
      const data = await fetch("https://api.beefy.finance/vaults").then((response) => response.json());
      prices[poolName] = { usd: parseFloat(data.find((obj) => obj.id == pool.externalPoolData.metadata).pricePerFullShare) / 1e18 };
      for (const token of Object.values(pool.tokens) as any[]) {
        if (token.type == "LP-TOKEN") {
          const subPoolName = token.name;
          const subPoolData = await getPoolData(chain, subPoolName, prices, version, startTime, endTime);
          subTokenPrices[subPoolName] = subPoolData.LPTokenPrice;
        }
      }
    }
  } else {
    let tokenBalances: { [key: string]: number } = {};
    let userBalances: { [key: string]: string } = {};

    let currentBalances = await queryPoolBalances(chain, poolName, version, startTime, endTime);

    currentBalances["user"]["userBalances"].forEach((userBalance: { [key: string]: string }) => {
      userBalances[userBalance["oceanId"]] = userBalance["balance"];
    });

    Object.keys(pool["tokens"]).forEach((token: string) => {
      let tokenName = pool["tokens"][token]["name"];
      tokenBalances[tokenName] = parseInt(userBalances[token]) / 1e18;
    });

    LPTokenBalance = parseInt(currentBalances["oceanToken"]["supply"]) / 1e18;

    let sub_token_volume: number = 0;

    for (const token of Object.keys(pool.tokens)) {
      let tokenType = pool["tokens"][token]["type"];
      let tokenName = pool["tokens"][token]["name"];

      if (tokenType === "LP-TOKEN") {
        let subTokenPoolData = await getPoolData(chain, tokenName, prices, version, startTime, endTime);
        subTokenPrices[tokenName] = subTokenPoolData["LPTokenPrice"];
        Object.keys(subTokenPoolData["breakdown"]).forEach((subToken: string) => {
          fractalPoolData[tokenName] = {
            balanceInPool: tokenBalances[tokenName],
            totalBalance: subTokenPoolData["LPTokenBalance"],
            balancesBreakdown: subTokenPoolData["balances"],
            "24HrVolume": subTokenPoolData["24HrVolume"],
          };
        });
      }
    }

    Object.keys(tokenBalances).forEach((token: string) => {
      let tokenData = pool["tokens"][TOKEN_NAMES[chain][token]];

      if (tokenData["type"] === "ERC-20" || tokenData["type"] === "ERC-1155") {
        balances[token] = tokenBalances[token];
      } else if (tokenData["type"] === "LP-TOKEN") {
        let tokenPercentage = fractalPoolData[token]["balanceInPool"] / fractalPoolData[token]["totalBalance"];
        sub_token_volume += tokenPercentage * fractalPoolData[token]["24HrVolume"];

        Object.keys(fractalPoolData[token]["balancesBreakdown"]).forEach((subToken: string) => {
          let tokenBalance = fractalPoolData[token]["balancesBreakdown"][subToken] * tokenPercentage;
          if (balances[subToken]) {
            balances[subToken] += tokenBalance;
          } else {
            balances[subToken] = tokenBalance;
          }
        });
      }
    });

    volume = sub_token_volume;

    Object.keys(balances).forEach((token: string) => {
      totalValueLocked += balances[token] * prices[COIN_GECKO_IDS[token]]["usd"];
    });

    Object.keys(balances).forEach((token: string) => {
      breakdown[token] = Math.round(((balances[token] * prices[COIN_GECKO_IDS[token]]["usd"]) / totalValueLocked) * 100);
    });

    LPTokenPrice = totalValueLocked / LPTokenBalance;
  }

  let namesToId = Object.fromEntries(Object.entries(TOKEN_NAMES[chain]).map(([k, v]) => [v, k]));

  let setOfTokens = [...Object.keys(pool["tokens"]), pool["oceanId"]];

  let interactions = await queryPoolInteractions(chain, poolName, version, startTime, endTime);

  Object.keys(interactions).forEach((interactionType: string) => {
    interactions[interactionType].forEach((interaction: { [key: string]: string }) => {
      if (
        poolName == "UNI" ||
        (setOfTokens.includes(interaction["inputToken"]) && (interaction["outputToken"] === setOfTokens[0] || interaction["outputToken"] === setOfTokens[1]))
      ) {
        let price: number;
        if (namesToId[interaction["inputToken"]] in subTokenPrices) {
          price = subTokenPrices[namesToId[interaction["inputToken"]]];
        } else if (namesToId[interaction["inputToken"]] === poolName) {
          price = LPTokenPrice;
        } else {
          price = prices[COIN_GECKO_IDS[namesToId[interaction["inputToken"]]]]["usd"];
        }

        volume += (parseInt(interaction["inputAmount"]) / 1e18) * price;
      }
    });
  });

  return {
    totalValueLocked,
    LPTokenPrice,
    LPTokenBalance,
    breakdown,
    balances,
    "24HrVolume": volume,
  };
}

// Function that defines the query to get the previous block before the start of a given date
function blockQuery(timestamp: number): string {
  return `
    {
      blocks(first: 1, where: {timestamp_lt: ${timestamp}}, orderBy: timestamp, orderDirection: desc) {
        number
        timestamp
      }
    }`;
}

// Function that queries a subgraph and gets the last block before a given date
async function getBlocks(date: number, chain: string): Promise<number> {
  const url: string = chain === "arbitrum-one" ? MAINNET_BLOCKS_URL : "";
  const query: string = blockQuery(date);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    const endBlock: number = data.data.blocks[0].number;
    return endBlock;
  } catch (error) {
    console.error("Error fetching block data:", error);
    throw error;
  }
}

async function queryPoolBalances(
  chain: string,
  poolName: string,
  version: string,
  startTime: number | null = null,
  endTime: number | null = null
): Promise<any> {
  let url: string = "";
  if (chain === "arbitrum-one") {
    url = version === "v3" ? MAINNET_V3_SUBGRAPH_URL : MAINNET_SUBGRAPH_URL;
  }

  let pool: any = version === "v3" ? POOL_DATA_V3[chain][poolName] : POOL_DATA[chain][poolName];
  let poolAddress: string = `${pool["address"]}`;
  let oceanId: string = `${pool["oceanId"]}`;
  let endTimeStamp: number = endTime || Math.floor(Date.now() / 1000);
  let blockNumber: number = (await getBlocks(endTimeStamp, chain)) - 100;

  let query: string = definePoolBalancesQuery(poolAddress, oceanId, blockNumber);
  const currentBalancesData: any = (
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }).then((response) => response.json())
  ).data;

  return currentBalancesData;
}

async function queryPoolInteractions(chain: string, poolName: string, version: string, startTime: number, endTime: number): Promise<any> {
  let url: string = "";
  if (chain === "arbitrum-one") {
    url = version === "v3" ? MAINNET_V3_SUBGRAPH_URL : MAINNET_SUBGRAPH_URL;
  }

  let pool: any = version === "v3" ? POOL_DATA_V3[chain][poolName] : POOL_DATA[chain][poolName];
  let poolAddress: string = `${pool["address"]}`;
  let interactionsData: any = {};

  let computeInputAmountsList: any[] = [];
  let computeOutputAmountsList: any[] = [];
  let inputAmountsLastId: string = '""';
  let outputAmountsLastId: string = '""';

  while (true) {
    const query = defineComputesQuery(poolAddress, startTime, endTime, inputAmountsLastId, outputAmountsLastId);
    const computesResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const computes: any = (await computesResponse.json()).data;

    const computeOutputAmounts: any[] = computes.computeOutputAmounts || [];
    const computeInputAmounts: any[] = computes.computeInputAmounts || [];

    if (computeInputAmounts.length === 0 && computeOutputAmounts.length === 0) {
      break;
    } else if (computeInputAmounts.length === 0) {
      outputAmountsLastId = `"${computeOutputAmounts[computeOutputAmounts.length - 1].id}"`;
      inputAmountsLastId = "-1";
    } else if (computeOutputAmounts.length === 0) {
      inputAmountsLastId = `"${computeInputAmounts[computeInputAmounts.length - 1].id}"`;
      outputAmountsLastId = "-1";
    } else {
      inputAmountsLastId = `"${computeInputAmounts[computeInputAmounts.length - 1].id}"`;
      outputAmountsLastId = `"${computeOutputAmounts[computeOutputAmounts.length - 1].id}"`;
    }

    computeInputAmountsList = computeInputAmountsList.concat(computeInputAmounts);
    computeOutputAmountsList = computeOutputAmountsList.concat(computeOutputAmounts);
  }

  interactionsData["computeInputAmounts"] = computeInputAmountsList;
  interactionsData["computeOutputAmounts"] = computeOutputAmountsList;

  return interactionsData;
}

async function getTokenBalance(chain: string, pool: string, version: string = "v2"): Promise<{ [key: string]: number }> {
  const url: string = chain === "arbitrum-one" ? (version === "v3" ? MAINNET_V3_SUBGRAPH_URL : MAINNET_SUBGRAPH_URL) : "";

  const poolData: any = version === "v3" ? POOL_DATA_V3[chain][pool] : POOL_DATA[chain][pool];
  const poolAddress: string = `${poolData.address}`;
  const oceanId: string = `${poolData.oceanId}`;
  const endTime: number = Math.floor(Date.now() / 1000);
  const blockNumber: number = (await getBlocks(endTime, chain)) - 150;
  const query: string = definePoolBalancesQuery(poolAddress, oceanId, blockNumber);

  const response: Response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const currentBalances: any = await response.json();

  const tokenBalances: { [key: string]: number } = {};
  const userBalances: { [key: string]: string } = {};

  currentBalances.data.user.userBalances.forEach((userBalance: any) => {
    userBalances[userBalance.oceanId] = userBalance.balance;
  });

  Object.keys(poolData.tokens).forEach((token: string) => {
    const tokenName: string = poolData.tokens[token].name;
    tokenBalances[tokenName] = parseInt(userBalances[token]) / 1e18;
  });

  tokenBalances["supply"] = parseFloat(currentBalances.data.oceanToken.supply) / 1e18;

  return tokenBalances;
}


// Volume is derived by summing up the token dollar values of all the Ocean interactions that went through all the pools
export async function getVolume(timestamp: number): Promise<number> {
  const chain: string = "arbitrum-one"; 
  const prices: { [key: string]: { usd: number } } = await getPrices(chain);
  const endTime: number = timestamp;
  const startTime: number = endTime - 24 * 60 * 60;

  const poolKeys: string[] = Object.keys(POOL_DATA["arbitrum-one"]).concat(Object.keys(POOL_DATA_V3["arbitrum-one"]));

  const poolDataPromises: Promise<{
    totalValueLocked: number;
    LPTokenPrice: number;
    LPTokenBalance: number;
    breakdown: { [key: string]: number };
    balances: { [key: string]: number };
    "24HrVolume": number;
  }>[] = [];
  for (const poolKey of poolKeys) {
    const version: string = POOL_DATA["arbitrum-one"][poolKey] ? "v2" : "v3";
    poolDataPromises.push(getPoolData(chain, poolKey, prices, version, startTime, endTime));
  }

  const poolDataResults: {
    totalValueLocked: number;
    LPTokenPrice: number;
    LPTokenBalance: number;
    breakdown: { [key: string]: number };
    balances: { [key: string]: number };
    "24HrVolume": number;
  }[] = await Promise.all(poolDataPromises);

  const total24HrVolume: number = poolDataResults.reduce((sum: number, poolData: any) => {
    return sum + (poolData["24HrVolume"] || 0);
  }, 0);

  return total24HrVolume;
}
