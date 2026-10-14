import { existsSync } from 'fs'
import path from 'path'

// Load backend/.env (provider API keys, rate limits) without adding a dotenv dependency
const envFile = path.resolve(__dirname, '../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
