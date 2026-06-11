import { createServer } from 'vite'
const server = await createServer({ logLevel: 'silent' })
const mod = await server.ssrLoadModule('/src/blocks/generator.ts')
const sample = await server.ssrLoadModule('/src/blocks/sample.ts')
console.log(mod.blocksJsonToPython(sample.BRAWLER_BLOCKS_JSON))
await server.close()
