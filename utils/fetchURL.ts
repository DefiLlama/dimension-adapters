import axios, { AxiosRequestConfig } from "axios"
import { sleep } from "./utils"
import { getEnv } from "../helpers/env"

export default async function fetchURL(url: string, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await httpGet(url)
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error
      await sleep(getRetryDelay(error, attempt))
    }
  }
}

export async function postURL(url: string, data: any, retries = 3, options?: AxiosRequestConfig) {
  try {
    const res = await httpPost(url, data, options)
    return res
  } catch (error) {
    if (retries > 0) return postURL(url, data, retries - 1, options)
    throw error
  }
}

function formAxiosError(url: string, error: any, options?: any) {
  let e = new Error((error as any)?.message)
  const status = (error as any)?.response?.status
  const retryAfter = (error as any)?.response?.headers?.['retry-after']
  const isNetworkError = !status && !!(error as any)?.request
  const axiosError = (error as any)?.response?.data?.message || (error as any)?.response?.data?.error || (error as any)?.response?.statusText || (error as any)?.response?.data;
  (e as any).url = url;
  Object.keys(options || {}).forEach((key) => (e as any)[key] = options[key]);
  if (Number.isInteger(status)) (e as any).status = status
  if (!status && !isNetworkError) (e as any).retryable = false
  if (retryAfter) (e as any).retryAfter = retryAfter
  if (axiosError) (e as any).axiosError = axiosError;
  delete (e as any).stack
  return e
}

function isRetryable(error: any) {
  if (error?.retryable === false) return false
  return !error?.status || error.status === 429 || error.status >= 500
}

function getRetryDelay(error: any, attempt: number) {
  const retryAfter = error?.retryAfter
  const retryAfterSeconds = Number(retryAfter)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) return retryAfterSeconds * 1000

  const retryAt = Date.parse(retryAfter)
  if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now())

  return Math.min(500 * 2 ** attempt, 10_000)
}

const successCodes: number[] = [200, 201, 202, 203, 204, 205, 206, 207, 208, 226];
export async function httpGet(url: string, options?: AxiosRequestConfig, { withMetadata = false } = {}) {
  try {
    const res = await axios.get(url, options)
    if (!successCodes.includes(res.status)) throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`)
    if (!res.data) throw new Error(`Error fetching ${url}: no data`)
    if (withMetadata) return res
    return res.data
  } catch (error) {
    throw formAxiosError(url, error, { method: 'GET' })
  }
}

export async function httpPost(url: string, data: any, options?: AxiosRequestConfig, { withMetadata = false } = {}) {
  try {
    const res = await axios.post(url, data, options)
    if (!successCodes.includes(res.status)) throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`)
    if (!res.data) throw new Error(`Error fetching ${url}: no data`)
    return res.data
  } catch (error) {
    if (withMetadata) throw error
    throw formAxiosError(url, error, { method: 'POST' })
  }
}

export async function fetchURLAutoHandleRateLimit(url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await httpGet(url)
    } catch (error) {
      if (i < retries - 1) {
        await sleep(5000)
      } else {
        throw error
      }
    }
  }
}


export async function proxiedFetch(url: string) {
  const authInfo = getEnv('PROXY_AUTH')
  if (!authInfo) return httpGet(url)

  const [host, username, password, port] = authInfo.split(':')

  try {
    const client = axios.create()
    const { data } = await client
      .get(url.toString(), {
        proxy: {
          protocol: "https",
          host,
          port: parseInt(port ?? 8003),
          auth: { username, password },
        },
      })
    return data
  } catch (error) {
    console.error(`Error fetching ${url} through proxy:`, error)
    return httpGet(url)
  }
}
