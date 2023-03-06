import axios from "axios"

export async function queryFlipside(sqlQuery:string){
    const query = await axios.post("https://node-api.flipsidecrypto.com/queries", {
      "sql": sqlQuery,
      "ttl_minutes": 15,
      "cache": true
    }, {
      headers:{
        "x-api-key": "915bc857-d8d2-4445-8c55-022ab853476e"
      }
    })

    for(let i=0; i<6; i++){
        await new Promise(r => setTimeout(r, 20e3)); //20s

        const results = await axios.get(`https://node-api.flipsidecrypto.com/queries/${query.data.token}`, {
        headers:{
            "x-api-key": "915bc857-d8d2-4445-8c55-022ab853476e"
        }
        })

        const status = results.data.status
        if(status === "finished"){
            return results.data.results
        } else if(status!=="running"){
            throw new Error(`Query ${sqlQuery} failed, error ${JSON.stringify(results.data)}`)
        }   
    }
    throw new Error(`Query ${sqlQuery} timed out`)
}