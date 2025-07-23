import { FetchOptions } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

export async function caiFees(options: FetchOptions) {
  const res = await addTokensReceived({
    options, 
    targets: ['0x6D9F100ca14384262Ca6afd8ef7ceC265a113113', '0x6d825cE7F220c6cc03fE156F28BE6318e6546Ca8', ],
    tokens: ['0x48f88A3fE843ccb0b5003e70B4192c1d7448bEf0'],
  })

  return {
    dailyProtocolRevenue: res.clone(0.5),
    dailyHoldersRevenue: res.clone(0.5),
  }
}

