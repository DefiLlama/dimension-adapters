import { humanizeNumber } from "@defillama/sdk"

async function main(){
    const file = process.argv[2]
    const adapter = await import(`../${file}`)
    await Promise.all(adapter.users.map(async ({name, getUsers}:{name:string, getUsers:any})=>{
        const end = Math.floor(Date.now()/1e3)
        const start = end - 24*3600
        const users = await getUsers(start, end)
        console.log(`${name.padEnd(15, " ")} - ${humanizeNumber(users)}`)
    }))
}
main()

// eg: npx ts-node users/test.ts users/chains.ts