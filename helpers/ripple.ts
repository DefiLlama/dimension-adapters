const http = require('axios')

const endpoint = () => 'https://s1.ripple.com:51234';

export async function rpcCall(method: string, params: Array<any>): Promise<any> {
  return (await http.post(endpoint(), {
    method: method,
    params: params,
  })).data
}
