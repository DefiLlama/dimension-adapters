import * as sdk from '@defillama/sdk';
import { getUniqueAddresses } from '@defillama/sdk/build/generalUtil';
import axios from 'axios';
import { ethers } from "ethers";
import { FetchOptions } from "../adapters/types";
import { queryAllium } from './allium';
import { getCache, setCache } from "./cache";
import ADDRESSES from './coreAssets.json';
import { getEnv } from './env';

export const nullAddress = ADDRESSES.null

// NOTE: this works only with multisig contracts
export async function addGasTokensReceived(params: {
  multisig?: string;
  multisigs?: string[];
  options: FetchOptions;
  balances?: sdk.Balances;
  fromAddresses?: string[];
}) {
  let { multisig, multisigs, options, balances, fromAddresses } = params;
  if (multisig) multisigs = [multisig];
  if (!balances) balances = options.createBalances();
  if (!multisigs?.length) throw new Error('multisig or multisigs required');

  const batchSize = 5000;
  const allLogs: any[] = [];
  let batchLogs: any[];
  let offset = 0;
  const fromBlock = (await options.getFromBlock()) - 200
  const toBlock = (await options.getToBlock()) - 200

  for (;;) {
    batchLogs = await sdk.indexer.getLogs({
      chain: options.chain,
      targets: multisigs,
      topics: ['0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d'],
      onlyArgs: true,
      eventAbi: 'event SafeReceived (address indexed sender, uint256 value)',
      // ~~ Around 150 confirmation blocks for L1s, less than 10 for L2s
      fromBlock,
      toBlock,
      limit: batchSize,
      offset,
      all: false
    });
    allLogs.push(...batchLogs);
    if (batchLogs.length < batchSize) break;
    offset += batchSize;
  }

  if (fromAddresses) {
    const normalized = fromAddresses.map(a => a.toLowerCase());
    allLogs.forEach(log => {
      if (normalized.includes(log.sender?.toLowerCase?.())) {
        balances!.addGasToken(log.value);
      }
    });
  } else {
    allLogs.forEach(i => balances!.addGasToken(i.value));
  }

  return balances;
}

type AddTokensReceivedParams = {
  fromAdddesses?: string[];
  fromAddressFilter?: string | null;
  target?: string;
  targets?: string[];
  options: FetchOptions;
  balances?: sdk.Balances;
  tokens?: string[];
  toAddressFilter?: string | null;
  tokenTransform?: (token: string) => string;
  fetchTokenList?: boolean;
  token?: string;
  skipIndexer?: boolean;
  logFilter?: (log: any) => boolean;
}

export async function addTokensReceived(params: AddTokensReceivedParams) {

  if (!params.skipIndexer) {
    try {
      const balances = await _addTokensReceivedIndexer(params)
      return balances
    } catch (e) {
      console.error('Token transfers: Failed to use indexer, falling back to logs', (e as any)?.message)
    }
  }



  let { target, targets, options, balances, tokens, fromAddressFilter = null, tokenTransform = (i: string) => i, fetchTokenList = false, token, fromAdddesses, logFilter = () => true, } = params;
  const { chain, createBalances, getLogs, } = options

  if (!balances) balances = createBalances()

  if (fromAdddesses && fromAdddesses.length) {
    if (fromAdddesses.length === 1) fromAddressFilter = fromAdddesses[0]
    else {
      const clonedOptions = { ...params, balances, skipIndexer: true }
      delete clonedOptions.fromAdddesses
      await Promise.all(fromAdddesses.map(fromAddressFilter => addTokensReceived({ ...clonedOptions, fromAddressFilter })))
      return balances
    }
  }

  if (!tokens && token) tokens = [token]


  if (targets?.length) {
    const clonedOptions = { ...params }
    delete clonedOptions.targets
    clonedOptions.balances = balances
    await Promise.all(targets.map(target => addTokensReceived({ ...clonedOptions, target })))
    return balances
  } else if (!target && !fromAddressFilter) {
    throw new Error('target/fromAddressFilter or targets required')
  }

  const toAddressFilter = target ? ethers.zeroPadValue(target, 32) : null
  if (fromAddressFilter) fromAddressFilter = ethers.zeroPadValue(fromAddressFilter, 32)

  if (!tokens && target) {
    if (fetchTokenList) {
      if (!ankrChainMapping[chain]) throw new Error('Chain Not supported: ' + chain)
      const ankrTokens = await ankrGetTokens(target, { onlyWhitelisted: true })
      tokens = ankrTokens[ankrChainMapping[chain]] ?? []
    } else {
      return getAllTransfers(fromAddressFilter, toAddressFilter, balances, tokenTransform, options)
    }
  }

  if (!tokens?.length) return balances

  tokens = getUniqueAddresses(tokens.filter(i => !!i), options.chain)

  const logs = await getLogs({
    targets: tokens,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', fromAddressFilter as string, toAddressFilter as any],
  })

  logs.forEach((logs, index) => {
    const token = tokens![index]
    logs.filter(logFilter).forEach((i: any) => balances!.add(tokenTransform(token), i.value))
  })
  return balances
}

async function _addTokensReceivedIndexer(params: AddTokensReceivedParams) {
  let { balances, fromAddressFilter, target, targets, options, fromAdddesses, tokenTransform = (i: string) => i, tokens,  logFilter = () => true,  } = params
  const { createBalances, chain, getFromBlock, getToBlock } = options
  if (!balances) balances = createBalances()
  if (fromAdddesses && fromAdddesses.length) (fromAddressFilter as any) = fromAdddesses
  const logs = await sdk.indexer.getTokenTransfers({
    fromBlock: await getFromBlock(),
    toBlock: await getToBlock(),
    chain,
    target, targets,
    fromAddressFilter: fromAddressFilter as any,
    tokens,
  })
  logs.filter(logFilter).forEach((i: any) => {
    balances!.add(tokenTransform(i.token), i.value)
  })

  return balances
}

const ankrTokenCalls: any = {}

const ankrChainMapping: {
  [chain: string]: string
} = {
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  fantom: 'fantom',
  polygon: 'polygon',
  polygon_zkevm: 'polygon_zkevm',
  era: 'zksync_era',
  avax: 'avalanche',
  flare: 'flare',
  xdai: 'gnosis',
  linea: 'linea',
  rollux: 'rollux',
  scroll: 'scroll',
  syscoin: 'syscoin',
}

async function ankrGetTokens(address: string, { onlyWhitelisted = true }: {
  onlyWhitelisted?: boolean
} = {}) {
  address = address.toLowerCase()

  if (!ankrTokenCalls[address]) ankrTokenCalls[address] = _call()
  return ankrTokenCalls[address]

  async function _call() {
    const project = 'ankr-cache'
    const key = onlyWhitelisted ? address : `${address}/all`
    const timeNow = Math.floor(Date.now() / 1e3)
    const THREE_DAYS = 3 * 24 * 3600
    const cache = (await getCache(project, key)) ?? {}
    if (cache.timestamp && (timeNow - cache.timestamp) < THREE_DAYS / 3)
      return cache.tokens

    sdk.log('Pulling tokens for ' + address)

    const options = {
      method: 'POST',
      url: `https://rpc.ankr.com/multichain/${getEnv('ANKR_API_KEY')}`,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      data: {
        jsonrpc: '2.0',
        method: 'ankr_getAccountBalance',
        params: {
          onlyWhitelisted,
          nativeFirst: true,
          skipSyncCheck: true,
          walletAddress: address
        },
        id: 42
      }
    };
    const tokens: any = {}
    const { data: { result: { assets } } } = await axios(options)
    const tokenCache = { timestamp: timeNow, tokens, }
    for (const asset of assets) {
      const { contractAddress, blockchain } = asset
      if (!contractAddress) continue;
      if (!tokens[blockchain]) tokens[blockchain] = []
      tokens[blockchain].push(contractAddress)
    }
    for (const [chain, values] of Object.entries(tokens)) {
      tokens[chain] = getUniqueAddresses(values as any)
    }

    await setCache(project, key, tokenCache)
    return tokens
  }

  function getUniqueAddresses(values: string[]) {
    values = values.map(v => v.toLowerCase()).filter(v => v && v !== nullAddress)
    return [...new Set(values)]
  }
}

async function getAllTransfers(fromAddressFilter: string | null, toAddressFilter: string | null,
  balances: sdk.Balances, tokenTransform: (token: string) => string, options: FetchOptions) {
  const logs = await options.getLogs({
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer(address,address,uint256)
      fromAddressFilter as any,
      toAddressFilter as any
    ],
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    entireLog: true,
  })

  logs.forEach((log) => {
    if (log.data == '0x') return
    balances!.add(tokenTransform(log.address), log.data)
  })
  return balances
}

export async function getTokenDiff(params: {
  target?: string;
  targets?: string[];
  balances?: sdk.Balances;
  tokens?: string[];
  extraTokens?: string[];
  includeGasToken?: boolean;
  options: FetchOptions;
}) {
  let { target, targets, balances, tokens, includeGasToken = true, options, extraTokens = [] } = params;
  const { api, createBalances, getFromBlock, chain, } = options


  if (!balances) balances = createBalances()

  if (targets?.length) {
    const clonedOptions = { ...params }
    delete clonedOptions.targets
    clonedOptions.balances = balances
    await Promise.all(targets.map(target => getTokenDiff({ ...clonedOptions, target })))
    return balances
  } else if (!target) {
    throw new Error('target or targets required')
  }

  if (!tokens) {
    if (!ankrChainMapping[chain]) throw new Error('Chain Not supported: ' + chain)
    const ankrTokens = await ankrGetTokens(target, { onlyWhitelisted: true })
    tokens = ankrTokens[ankrChainMapping[chain]] ?? []
  }

  if (includeGasToken && !tokens?.includes(nullAddress)) tokens!.push(nullAddress)
  if (extraTokens.length) tokens!.push(...extraTokens)

  if (!tokens!.length) return balances

  const fromBlock = await getFromBlock()
  const fromApi = new sdk.ChainApi({ chain, block: fromBlock, })

  await api.sumTokens({ tokens, owner: target })
  await fromApi.sumTokens({ tokens, owner: target })

  balances.addBalances(api.getBalancesV2())
  balances.subtract(fromApi.getBalancesV2())


  return balances
}


export const evmReceivedGasAndTokens = (receiverWallet: string, tokens: string[]) =>
  async (options: FetchOptions) => {
    let dailyFees = options.createBalances()
    if (tokens.length > 0) {
      await addTokensReceived({ options, tokens: tokens, target: receiverWallet, balances: dailyFees })
    }
  //   const nativeTransfers = await queryDuneSql(options, `select sum(value) as received from CHAIN.traces
  // where to = ${receiverWallet} AND tx_success = TRUE
  // AND TIME_RANGE`)
  //   dailyFees.add(nullAddress, nativeTransfers[0].received)
    await getETHReceived({ options, balances: dailyFees, target: receiverWallet })

    return {
      dailyFees,
      dailyRevenue: dailyFees,
    }
  }

  /**
   * Retrieves the total value of tokens received by a Solana address or addresses within a specified time period
   * 
   * @param options - FetchOptions containing timestamp range and other configuration
   * @param balances - Optional sdk.Balances object to add the results to
   * @param target - Single Solana address to query
   * @param targets - Array of Solana addresses to query (alternative to target)
   * @param blacklists - Optional array of addresses to exclude from the sender side
   * @param blacklist_signers - Optional array of transaction signers to exclude
   * @returns The balances object with added USD value from received tokens
   */
  export async function getSolanaReceived({ options, balances, target, targets, blacklists, blacklist_signers }: {
    options: FetchOptions;
    balances?: sdk.Balances;
    target?: string;
    targets?: string[];
    blacklists?: string[];
    blacklist_signers?: string[];
  }) {
    // Initialize balances if not provided
    if (!balances) balances = options.createBalances();

    // If targets is provided, use that instead of single target
    const addresses = targets?.length ? targets : target ? [target] : [];
    if (addresses.length === 0) return balances;

    // Build SQL condition to exclude blacklisted sender addresses
    let blacklistCondition = '';
    
    if (blacklists && blacklists.length > 0) {
      const formattedBlacklist = blacklists.map(addr => `'${addr}'`).join(', ');
      blacklistCondition = `AND from_address NOT IN (${formattedBlacklist})`;
    }
    
    // Build SQL condition to exclude blacklisted transaction signers
    let blacklist_signersCondition = '';
    
    if (blacklist_signers && blacklist_signers.length > 0) {
      const formattedBlacklist = blacklist_signers.map(addr => `'${addr}'`).join(', ');
      blacklist_signersCondition = `AND signer NOT IN (${formattedBlacklist})`;
    }

    // Format addresses for IN clause
    const formattedAddresses = addresses.map(addr => `'${addr}'`).join(', ');
  
    // Construct SQL query to get sum of received token values in USD and native amount
    const query = `
      SELECT mint as token, SUM(raw_amount) as amount
      FROM solana.assets.transfers
      WHERE to_address IN (${formattedAddresses})
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
      ${blacklistCondition}
      ${blacklist_signersCondition}
      GROUP BY mint
    `;
  
    // Execute query against Allium database
    const res = await queryAllium(query);
    
    // Add the USD value to the balances object (defaulting to 0 if no results)
    res.forEach((row: any) => {
      balances!.add(row.token, row.amount)
    })
    return balances;
  }
  

export async function getETHReceived({ options, balances, target, targets }: { options: FetchOptions, balances?: sdk.Balances, target?: string, targets?: string[] }) {
  if (!balances) balances = options.createBalances()

  if (targets?.length) {
    for (const target of targets)
      await getETHReceived({ options, balances, target })
    return balances
  }

  target = target?.toLowerCase()
  const chainMap: any = {
    ethereum: 'ethereum',
    base: 'base',
    optimism: 'optimism',
    scroll: 'scroll',
    bsc: 'bsc',
    arbitrum: 'arbitrum',
    polygon: 'polygon',
    blast: 'blast',
    celo: 'celo',
  }
  const tableMap: any = {
    bsc: 'bnb_token_transfers',
  }
  const chainKey = chainMap[options.chain]
  if (!chainKey) throw new Error('[Pull eth transfers] Chain not supported: ' + options.chain)

  const query = `
    SELECT SUM(raw_amount) as value
    FROM ${chainKey}.assets.${tableMap[options.chain] ?? 'eth_token_transfers'}
    WHERE to_address = '${target}' 
    AND transfer_type = 'value_transfer'
    AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `
  const res = await queryAllium(query)
  balances.add(nullAddress, res[0].value)
  return balances
}
