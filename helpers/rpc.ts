import axios, { AxiosRequestConfig, HttpStatusCode } from "axios"

// http 400s, rate limits
const CooldownOnClientError = 60 // 1 minute

// http 500x, server side error
const CooldownOnServerError = 300 // 5 minute

// undefined, 0 or a past time is a ready to call endpoint
const GlobalEndpointsCooldown: { [key: string]: number } = {}

async function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time * 1000))
}

function getEndpoint(endpoints: Array<string>): string {
  let endpoint: null | string = null;

  while(!endpoint) {
    endpoint = endpoints[Math.floor(Math.random() * endpoints.length)]
    
    const timestamp = Math.floor(new Date().getTime() / 1000)
    if (GlobalEndpointsCooldown[endpoint] && GlobalEndpointsCooldown[endpoint] > timestamp) {
      endpoint = null
    }
  }

  return endpoint
}

export async function makeCall(endpoint: string, subpath: string | null | undefined, httpMethod: 'POST' | 'GET', httpBody: any): Promise<any> {
  const options: AxiosRequestConfig = {
    method: httpMethod,
    url: subpath ? `${endpoint}/${subpath}` : endpoint,
    data: httpBody,

    // accept any status, don't throw Exception on failed
    validateStatus: (_: number) => true,
  }

  return await axios.request(options)
}

export async function loadBalanceRpcRequest(endpoints: Array<string>, subpath: string | null | undefined, httpMethod: 'POST' | 'GET', httpBody: any): Promise<any> {
  if (endpoints.length === 1) {
    return await makeCall(endpoints[0], subpath, httpMethod, httpBody)
  }

  const endpointToCall = getEndpoint(endpoints)
  
  const httpResponse = await makeCall(endpointToCall, subpath, httpMethod, httpBody)

  if (httpResponse.status === 200) {
    return httpResponse.data
  } else {
    const anotherEndpointToCall = getEndpoint(endpoints.filter(endpoint => endpoint !== endpointToCall))
    const anotherHttpResponse = await makeCall(anotherEndpointToCall, subpath, httpMethod, httpBody)

    if (httpResponse.status >= 400 && httpResponse.status < 500 && anotherHttpResponse.status === 200) {
      GlobalEndpointsCooldown[endpointToCall] = Math.floor(new Date().getTime() / 1000) + CooldownOnClientError
    } else if (httpResponse.status >= 500 && anotherHttpResponse.status === 200) {
      GlobalEndpointsCooldown[endpointToCall] = Math.floor(new Date().getTime() / 1000) + CooldownOnServerError
    }

    return anotherHttpResponse.data;
  }
}