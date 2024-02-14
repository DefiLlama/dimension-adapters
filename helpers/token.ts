import ADDRESSES from './coreAssets.json'
import { FetchOptions } from "../adapters/types";
import * as sdk from '@defillama/sdk'
import axios from 'axios'
import { getCache, setCache } from "./cache";
import { ethers } from "ethers";
import { getUniqueAddresses } from '@defillama/sdk/build/generalUtil';
import { getEnv } from './env';

export const nullAddress = ADDRESSES.null

export async function addGasTokensReceived(params: {
  multisig?: string;
  multisigs?: string[];
  options: FetchOptions;
  balances?: sdk.Balances;
}) {
  let { multisig, multisigs, options, balances } = params;

  if (!balances) balances = options.createBalances()

  if (multisigs?.length) {
    const clonedOptions = { ...params }
    delete clonedOptions.multisigs
    clonedOptions.balances = balances
    await Promise.all(multisigs.map(multisig => addGasTokensReceived({ ...clonedOptions, multisig })))
    return balances
  } else if (!multisig) {
    throw new Error('multisig or multisigs required')
  }

  const logs = await options.getLogs({
    target: multisig,
    eventAbi: 'event SafeReceived (address indexed sender, uint256 value)'
  })

  logs.forEach(i => balances!.addGasToken(i.value))
  return balances
}

export async function addTokensReceived(params: {
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
}) {
  let { target, targets, options, balances, tokens, fromAddressFilter = null, tokenTransform = (i: string) => i, fetchTokenList = false, token } = params;
  const { chain, createBalances, getLogs, } = options
  if (!tokens && token) tokens = [token]

  if (!balances) balances = createBalances()

  if (targets?.length) {
    const clonedOptions = { ...params }
    delete clonedOptions.targets
    clonedOptions.balances = balances
    await Promise.all(targets.map(target => addTokensReceived({ ...clonedOptions, target })))
    return balances
  } else if (!target && !fromAddressFilter) {
    throw new Error('target/fromAddressFilter or targets required')
  }


  if (!tokens && target && fetchTokenList) {
    if (!ankrChainMapping[chain]) throw new Error('Chain Not supported: ' + chain)
    const ankrTokens = await ankrGetTokens(target, { onlyWhitelisted: true })
    tokens = ankrTokens[ankrChainMapping[chain]] ?? []
  }

  if (!tokens?.length) return balances

  tokens = getUniqueAddresses(tokens.filter(i => !!i), options.chain)

  const toAddressFilter = target ? ethers.zeroPadValue(target, 32) : null
  if (fromAddressFilter) fromAddressFilter = ethers.zeroPadValue(fromAddressFilter, 32)
  const logs = await getLogs({
    targets: tokens,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', fromAddressFilter as string, toAddressFilter as any],
  })

  logs.forEach((logs, index) => {
    const token = tokens![index]
    logs.forEach((i: any) => balances!.add(tokenTransform(token), i.value))
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
