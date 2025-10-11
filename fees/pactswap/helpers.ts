import { gql, request } from "graphql-request"

const COINWEB_URL = 'https://api-cloud.coinweb.io'
const queryCount = gql`
  query(
    $start: NaiveDateTime
    $end: NaiveDateTime
    $feeSmartContract: String
  ) {
  network(net: BNB) {
    countClaims(
      issuer: {
        FromSmartContract: $feeSmartContract
      }
      firstPartOfKey: ["FUNDS"]
      datetimeRange: { from: $start, to: $end }
    )
  }
}
`

type QueryFee = {
    network: {
        fetchClaims: {
            claims: Array<{
                blockInfo: FeeClaimBlockInfo
                claim: FeeClaimClaim
            }>
            hasNextPage: boolean
            nextPageAnchor: {
                hash: string
                height: number
            }
        }
    }
}

type FeeClaimBlockInfo = {
    height: number
    time: string
    hash: string
}
type FeeClaimClaim = {
    content: {
        body: string
        feesStored: `0x${string}`
        key: string
    }
}
const queryFee = gql`
query (
  $feeSmartContract: String!
  $start: NaiveDateTime
  $end: NaiveDateTime
  $countToReturn: Int!
) {
  network(net: BNB) {
    fetchClaims(
      issuer: { FromSmartContract: $feeSmartContract }
      firstPartOfKey: ["FUNDS"]
      maxClaimsToReturn: $countToReturn
      datetimeRange: { from: $start, to: $end }
    ) {
      claims {
        blockInfo {
          height
          time
          hash
        }
        claim {
          content {
            body
            feesStored
            key
          }
          issuer
        }
      }
      hasNextPage
      nextPageAnchor {
        hash
        height
      }
    }
  }
}`

export const getFeeSmartContract = async(): Promise<string> => {
    const data = await fetch('https://app.pactswap.io/build-info.json')
    const json = await data.json()
    try {
        const feeSmartContract = json.BTC.L2_CONTRACT_ADDRESS_MAKER.module.instance.parameters.content.owner;
        return feeSmartContract
    } catch (error) {
        throw new Error('Failed to get fee smart contract', { cause: error })
    }
}

export const getFeeClaimsCount = async(feeSmartContract: string, startTime: string, endTime: string): Promise<number> => {
    const countResponse = await request(COINWEB_URL, queryCount, {
        start: startTime,
        end: endTime,
        feeSmartContract: feeSmartContract,
    });

    const count = countResponse.network.countClaims;
    return Number(count);
}

const getFeeClaims = async(feeSmartContract: string, startTime: string, endTime: string, countToReturn: number) => {
    const feeResponse = await request<QueryFee>(COINWEB_URL, queryFee, {
        start: startTime,
        end: endTime,
        feeSmartContract: feeSmartContract,
        countToReturn: countToReturn,
    });
    return feeResponse.network.fetchClaims;
}

export const oneDayInSeconds = 86400;

export const getFee = async(feeSmartContract: string, startTime: string, endTime: string, countToReturn: number): Promise<number> => {
    const feeClaims = await getFeeClaims(feeSmartContract, startTime, endTime, countToReturn);
    if (feeClaims.claims.length === 1) {
        return Number(feeClaims.claims[0].claim.content.feesStored);
    }

    let nearesToEndTime: typeof feeClaims.claims[0] | undefined = undefined;

    for (const claim of feeClaims.claims) {
        if (new Date(claim.blockInfo.time) <= new Date(startTime)) {
            nearesToEndTime = claim;
        }
    }

    const bottomClaim = nearesToEndTime || feeClaims.claims[0];
    const bottomFee = Number(bottomClaim.claim.content.feesStored);

    const latesFeeClaim = feeClaims.claims.at(-1);
    const latestFee = Number(latesFeeClaim?.claim.content.feesStored);

    const fee = latestFee - bottomFee;
    return fee;
}