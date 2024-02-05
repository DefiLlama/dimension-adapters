import axios, { AxiosRequestConfig } from "axios"

export default async function fetchURL(url: string, retries = 3) {
  try {
    const res = await httpGet(url)
    return res
  } catch (error) {
    if (retries > 0) return fetchURL(url, retries - 1)
    throw error
  }
}

export async function postURL(url: string, data: any, retries = 3) {
  try {
    const res = await httpPost(url, data)
    return res
  } catch (error) {
    if (retries > 0) return postURL(url, data, retries - 1)
    throw error
  }
}

function formAxiosError(url: string, error: any, options?: any) {
  let e = new Error((error as any)?.message)
  const axiosError = (error as any)?.response?.data?.message || (error as any)?.response?.data?.error || (error as any)?.response?.statusText || (error as any)?.response?.data;
  (e as any).url = url;
  Object.keys(options || {}).forEach((key) => (e as any)[key] = options[key]);
  if (axiosError) (e as any).axiosError = axiosError;
  delete (e as any).stack
  return e
}

export async function httpGet(url: string, options?: AxiosRequestConfig) {
  try {
    const res = await axios.get(url, options)
    if (res.status !== 200) throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`)
    if (!res.data) throw new Error(`Error fetching ${url}: no data`)
    return res.data
  } catch (error) {
    throw formAxiosError(url, error, { method: 'GET' })
  }
}

export async function httpPost(url: string, data: any, options?: AxiosRequestConfig) {
  try {
    const res = await axios.post(url, data, options)
    if (res.status !== 200) throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`)
    if (!res.data) throw new Error(`Error fetching ${url}: no data`)
    return res.data
  } catch (error) {
    throw formAxiosError(url, error, { method: 'POST' })
  }
}