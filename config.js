require('dotenv').config()

const path = require('path')

// 环境变量配置
const UPLOAD_URL = process.env.UPLOAD_URL || ''
const PROJECT_URL = process.env.PROJECT_URL || ''
const AUTO_ACCESS = String(process.env.AUTO_ACCESS || '').toLowerCase() === 'true'
const FILE_PATH = process.env.FILE_PATH || '.tmp'
const SUB_PATH = process.env.SUB_PATH || 'sub'
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000
const UUID = process.env.UUID || '942f2749-6428-4833-b0a3-624b46271884'
const NEZHA_SERVER = process.env.NEZHA_SERVER || ''
const NEZHA_KEY = process.env.NEZHA_KEY || ''
const NEZHA_TLS = String(process.env.NEZHA_TLS || '').toLowerCase() === 'true'
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || ''
const ARGO_AUTH = process.env.ARGO_AUTH || ''
const ARGO_PORT = process.env.ARGO_PORT || 8001
const CFIP = process.env.CFIP || 'saas.sin.fan'
const CFPORT = process.env.CFPORT || 443
const NAME = process.env.NAME || ''

// 运行目录相关路径
const npmName = 'nezha-agent'
const webName = 'xy'
const botName = 'cf'

const npmPath = path.join(FILE_PATH, npmName)
const webPath = path.join(FILE_PATH, webName)
const botPath = path.join(FILE_PATH, botName)
const subPath = path.join(FILE_PATH, 'sub.txt')
const listPath = path.join(FILE_PATH, 'list.txt')
const bootLogPath = path.join(FILE_PATH, 'boot.log')
const configPath = path.join(FILE_PATH, 'config.json')
const nezhaConfigPath = path.join(FILE_PATH, 'nzconfig.yml')

module.exports = {
	UPLOAD_URL,
	PROJECT_URL,
	AUTO_ACCESS,
	FILE_PATH,
	SUB_PATH,
	PORT,
	UUID,
	NEZHA_SERVER,
	NEZHA_KEY,
	NEZHA_TLS,
	ARGO_DOMAIN,
	ARGO_AUTH,
	ARGO_PORT,
	CFIP,
	CFPORT,
	NAME,
	npmName,
	webName,
	botName,
	npmPath,
	webPath,
	botPath,
	subPath,
	listPath,
	bootLogPath,
	configPath,
	nezhaConfigPath
}

