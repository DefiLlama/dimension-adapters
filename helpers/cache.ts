import * as sdk from '@defillama/sdk'
import axios from 'axios'

const Bucket = "dimensions-adapter-cache";

function getKey(project: string, chain: string) {
  return `cache/${project}/${chain}.json`
}

function getFileKey(project: string, chain: string) {
  return `${Bucket}/${getKey(project, chain)}`
}


export async function getCache(project: string, chain: string, { } = {}) {
  const fileKey = getFileKey(project, chain)

  try {
    const json = await sdk.cache.readCache(fileKey)
    if (!json || Object.keys(json).length === 0) throw new Error('Invalid data')
    return json
  } catch (e) {
    sdk.log('failed to fetch data from s3 bucket:', fileKey)
    // sdk.log(e)
    return {}
  }
}

export async function setCache(project: string, chain: string, cache: any) {
  const Key = getFileKey(project, chain)

  try {
    await sdk.cache.writeCache(Key, cache)
  } catch (e) {
    sdk.log('failed to write data to s3 bucket: ', Key)
    sdk.log(e)
  }
}

const configCache: any = {}

async function _setCache(project: string, chain: string, json: any) {
  if (!json || json?.error?.message) return;
  const strData = typeof json === 'string' ? json : JSON.stringify(json)
  let isValidData = strData.length > 42
  if (isValidData) // sometimes we get bad data/empty object, we dont overwrite cache with it
    await setCache(project, chain, json)
}

export async function getConfig(project: string, endpoint: string, { fetcher }: {
  fetcher?: () => Promise<any>
} = {}) {
  if (!project || (!endpoint && !fetcher)) throw new Error('Missing parameters')
  const key = 'config-cache'
  const cacheKey = getKey(key, project)
  if (!configCache[cacheKey]) configCache[cacheKey] = _getConfig()
  return configCache[cacheKey]

  async function _getConfig() {
    try {
      let json
      if (endpoint) {
        json = (await axios.get(endpoint)).data
      } else {
        json = await fetcher!()
      }
      if (!json) throw new Error('Invalid data')
      await _setCache(key, project, json)
      return json
    } catch (e) {
      // sdk.log(e)
      sdk.log(project, 'tryng to fetch from cache, failed to fetch data from endpoint:', endpoint)
      return getCache(key, project)
    }
  }
}

export async function configPost(project: string, endpoint: string, data: any) {
  if (!project || !endpoint) throw new Error('Missing parameters')
  const key = 'config-cache'
  const cacheKey = getKey(key, project)
  if (!configCache[cacheKey]) configCache[cacheKey] = _configPost()
  return configCache[cacheKey]

  async function _configPost() {
    try {
      const { data: json } = await axios.post(endpoint, data)
      await _setCache(key, project, json)
      return json
    } catch (e) {
      // sdk.log(e)
      sdk.log(project, 'tryng to fetch from cache, failed to fetch data from endpoint:', endpoint)
      return getCache(key, project)
    }
  }
}


export async function cacheTransactions(cacheKey: string, cache: any) {
  const Key = getFileKey('transactions', cacheKey)

  try {
    await sdk.cache.writeCache(Key, cache, { skipR2CacheWrite: true })
  } catch (e) {
    sdk.log('failed to write data to s3 bucket: ', Key)
    sdk.log(e)
  }
}

export async function readCachedTransactions(cacheKey: string) {
  const Key = getFileKey('transactions', cacheKey)

  try {
    const data = await sdk.cache.readCache(Key, { skipR2Cache: true })
    return data
  } catch (e) {
    sdk.log('failed to read data: ', Key)
    return {}
  }
}