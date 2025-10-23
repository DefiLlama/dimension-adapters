import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface PoolConfig {
  poolAddress: string;
  vaultAddress: string;
  tokens: { address: string; symbol: string }[];
  poolType: string;
  chain: string;
}

const POOLS: PoolConfig[] = [
  {
    poolAddress: "0x3F89f8C0E0FfdfaE0b97959303831fa893f1CFE0",
    vaultAddress: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    tokens: [
      { address: "0xb4444468e444f89e1c2CAc2F1D3ee7e336cBD1f5", symbol: "RZR" },
      { address: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", symbol: "weETH" },
    ],
    poolType: "balancer",
    chain: CHAIN.ETHEREUM,
  },
  {
    poolAddress: "0xF2d8ad2984aA8050dD1CA1e74b862b165f7a622A",
    vaultAddress: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    tokens: [
      { address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", symbol: "wstETH" },
      { address: "0xb4444468e444f89e1c2CAc2F1D3ee7e336cBD1f5", symbol: "RZR" },
    ],
    poolType: "balancer",
    chain: CHAIN.ETHEREUM,
  },
  {
    poolAddress: "0x3c2d67E73150DcC80F8FD17227c50989aC9fB570",
    vaultAddress: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    tokens: [
      { address: "0xae78736Cd615f374D3085123A210448E74Fc6393", symbol: "rETH" },
      { address: "0xb4444468e444f89e1c2CAc2F1D3ee7e336cBD1f5", symbol: "RZR" },
    ],
    poolType: "balancer",
    chain: CHAIN.ETHEREUM,
  },
  {
    poolAddress: "0x91fae2cBfacc492E668F9259190b3b098175d304",
    vaultAddress: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    tokens: [
      { address: "0x657e8C867D8B37dCC18fA4Caead9C45EB088C642", symbol: "eBTC" },
      { address: "0xb4444468e444f89e1c2CAc2F1D3ee7e336cBD1f5", symbol: "RZR" },
    ],
    poolType: "balancer",
    chain: CHAIN.ETHEREUM,
  },
  {
    poolAddress: "0x36e6765907DD61b50Ad33F79574dD1B63339B59c",
    vaultAddress: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    tokens: [
      { address: "0xb4444468e444f89e1c2CAc2F1D3ee7e336cBD1f5", symbol: "RZR" },
      { address: "0xE5DA20F15420aD15DE0fa650600aFc998bbE3955", symbol: "stS" },
    ],
    poolType: "balancer",
    chain: CHAIN.SONIC,
  },
  {
    poolAddress: "0x307Cc0ab64DC0496cC113357Ee14C53D4dB4b966",
    vaultAddress: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    tokens: [
      { address: "0x67A298e5B65dB2b4616E05C3b455E017275f53cB", symbol: "lstRZR" },
      { address: "0xE5DA20F15420aD15DE0fa650600aFc998bbE3955", symbol: "stS" },
    ],
    poolType: "balancer",
    chain: CHAIN.SONIC,
  },
];

interface Oracles {
  oracleAddredd: string;
  tokenSymbol: string;
  tokenAddress: string;
  chain: string;
}

const ORACLES: Oracles[] = [
  {
    oracleAddredd: "0x953DE2413Ecc373f918e5fc7b3859b1ba7A57Edf",
    tokenSymbol: "weETH",
    tokenAddress: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
    chain: CHAIN.ETHEREUM,
  },
  {
    oracleAddredd: "0xEfA7F1E794353Ce026Be0585B0b92f04B7242E69",
    tokenSymbol: "wstETH",
    tokenAddress: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    chain: CHAIN.ETHEREUM,
  },
  {
    oracleAddredd: "0x5FF4c905B4bA7bF8249f7C7f3F5cb0856F41e1a8",
    tokenSymbol: "rETH",
    tokenAddress: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    chain: CHAIN.ETHEREUM,
  },
  {
    oracleAddredd: "0x8Bfe8650CF9B5aA083cd5e634A42238dcf890014", //not working, arithmetic underflow or overflow because of decimal
    tokenSymbol: "eBTC",
    tokenAddress: "0x657e8C867D8B37dCC18fA4Caead9C45EB088C642",
    chain: CHAIN.ETHEREUM,
  },
  {
    oracleAddredd: "0x107a73ca7074Ae05C62010e71082877C838794C8",
    tokenSymbol: "stS",
    tokenAddress: "0xE5DA20F15420aD15DE0fa650600aFc998bbE3955",
    chain: CHAIN.SONIC,
  },
];

async function getUSDValue(options: FetchOptions, oracle: string, amount: string, chain: string): Promise<number> {
  try {
    // Oracle returns: (uint256 rzrAssets, uint256 usdAssets, uint256 lastUpdatedAt)
    const result = await options.api.call({
      target: oracle,
      params: [amount],
      abi: "function getPriceForAmount(uint256) external view returns (uint256, uint256, uint256)",
      chain: chain,
    });
    
    let usdAssets: number;
    // Handle both array and object responses
    if (Array.isArray(result)) {
      usdAssets = Number(result[1] || 0); // usdAssets is at index 1
    } else if (result && typeof result === 'object' && 'usdAssets' in result) {
      usdAssets = Number((result as any).usdAssets || 0);
    } else {
      return 0;
    }
    
    // Convert from wei to USD (assuming 18 decimals)
    return usdAssets / 1e18;
  } catch (error) {
    // Silently fail for oracle calls - not all tokens may have oracles
    return 0;
  }
}

function getOracleAddress(chain: string, tokenAddress: string): string | undefined {
  return ORACLES.find(
    (o) => o.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && o.chain === chain
  )?.oracleAddredd;
}



async function getTokenAPR(chain: string, project: string, tokenSymbol: string): Promise<number> {
  try {
    // Fetch from DeFiLlama Yields API
    const response = await fetch("https://yields.llama.fi/pools");

    if (!response.ok) {
      throw new Error(`Failed to fetch pools data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid data format received from DeFiLlama API");
    }

    const pool = data.data.find((p: any) =>
      p.chain.toLowerCase() === chain.toLowerCase() &&
      p.project === project &&
      p.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    );

    if (!pool) {
      throw new Error(`No pool found for project: ${project}, symbol: ${tokenSymbol}`);
    }

    const apr = pool.apyBase ?? pool.apy;

    if (typeof apr !== 'number' || apr < 0) {
      throw new Error(`Invalid APR data for ${tokenSymbol}: ${apr}`);
    }

    return apr;
  } catch (error) {
    throw new Error(`Failed to get APR for ${tokenSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function stSAPR(): Promise<number> {
  try {
    const url = "https://backend-v3.beets-ftm-node.com/";
    const payload = {
      operationName: "GetStakedSonicData",
      variables: {},
      query: `
        query GetStakedSonicData {
          stsGetGqlStakedSonicData {
            stakingApr
          }
        }
      `,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "accept": "*/*",
        "content-type": "application/json",
        // User-Agent, Origin, Referer not required for backend API in node
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Beets backend API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    const aprString = json?.data?.stsGetGqlStakedSonicData?.stakingApr;

    if (!aprString) {
      throw new Error("stS APR missing in response");
    }

    // The APR is a decimal (e.g. "0.03944573862134899" for 3.94%)
    const aprPct = parseFloat(aprString) * 100;
    console.log("Fetched stS APR from Beets backend:", aprPct.toFixed(2) + "%");
    return aprPct;
  } catch (e) {
    console.error("Failed to fetch stS APR from Beets backend:", e);
    return 0;
  }
}


async function eBTCAPR(): Promise<number>{
  return 0;
}

export async function fetchYieldFromPools(
  balances: any,
  options: FetchOptions
): Promise<void> {
  try {
    const currentChain = options.chain;
    
    // Filter pools for the current chain
    const currentChainPools = POOLS.filter(pool => pool.chain === currentChain);
    
    if (currentChainPools.length === 0) {
      return;
    }

    const aprs: Record<string, number> = {};

    if(currentChain === CHAIN.ETHEREUM){
      aprs["weETH"] = await getTokenAPR("Ethereum","ether.fi-stake","WEETH");
      aprs["wstETH"] = await getTokenAPR("Ethereum","lido","STETH");
      aprs["rETH"] = await getTokenAPR("Ethereum", "rocket-pool","RETH");
      aprs["eBTC"] = await eBTCAPR();
    }
    else{
      aprs["stS"] = await stSAPR();
    }

    for (const pool of currentChainPools) {
      for (const token of pool.tokens) {
        if (!(token.symbol in aprs)) continue;

        try {
          // Get pool token info including balances
          const poolTokenInfo = await options.api.call({
            target: pool.vaultAddress,
            params: [pool.poolAddress],
            abi: "function getPoolTokenInfo(address pool) external view returns (address[] memory tokens, tuple(uint8 tokenType, address rateProvider, bool paysYieldFees)[] memory tokenInfo, uint256[] memory balancesRaw, uint256[] memory lastBalancesLiveScaled18)",
            chain: pool.chain,
          });

          if (!poolTokenInfo || !poolTokenInfo.tokens || !poolTokenInfo.balancesRaw) {
            continue;
          }

          // Find the index of our token in the pool
          const tokenIndex = poolTokenInfo.tokens.findIndex((t: string) =>
            t.toLowerCase() === token.address.toLowerCase()
          );

          if (tokenIndex === -1) continue;

          const balance = poolTokenInfo.balancesRaw[tokenIndex];
          if (!balance || balance === "0") continue;

          const oracle = getOracleAddress(pool.chain, token.address);
          if (!oracle) continue;

          const usdValue = await getUSDValue(options, oracle, balance, pool.chain);
          if (!usdValue || usdValue <= 0) continue;

          // Calculate daily yield: (USD Value * APR) / 365
          const apr = aprs[token.symbol];
          const dailyYieldUsd = (Number(usdValue) * apr) / 365 / 100;
          
          if (dailyYieldUsd > 0) {
            balances.addCGToken('usd-coin', dailyYieldUsd);
          }
        } catch (tokenError) {
          // Skip individual token errors and continue with other tokens
          continue;
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to fetch yield from pools: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
