require('dotenv').config()

const path = require('path')
const os = require('os')
const fs = require('fs')
const crypto = require('crypto')

function resolveMachineCode() {
	const candidatePaths = ['/etc/machine-id', '/var/lib/dbus/machine-id', '/sys/class/dmi/id/product_uuid']
	for (const p of candidatePaths) {
		try {
			const content = fs.readFileSync(p, 'utf8').trim()
			if (content) return `${p}:${content}`
		} catch {}
	}
	return `fallback:${os.hostname()}|${os.platform()}|${os.arch()}`
}

function hashSeedToUuid(seed) {
	const digest = crypto.createHash('sha256').update(seed).digest()
	const bytes = Buffer.from(digest.subarray(0, 16))
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	const hex = bytes.toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// 环境变量配置
const UPLOAD_URL = process.env.UPLOAD_URL || ''
const PROJECT_URL = process.env.PROJECT_URL || ''
const AUTO_ACCESS = String(process.env.AUTO_ACCESS || '').toLowerCase() === 'true'
const FILE_PATH = process.env.FILE_PATH || '.tmp'
const SUB_PATH = process.env.SUB_PATH || '954932'
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || process.env.ARGO_PORT || 3000)
const HTTP_PORT = Number(process.env.HTTP_PORT || 3001)
const HTTP_DOMAIN = String(process.env.HTTP_DOMAIN || '').trim()
const NEZHA_SERVER = process.env.NEZHA_SERVER || ''
const NEZHA_KEY = process.env.NEZHA_KEY || ''
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || ''
const ARGO_AUTH = process.env.ARGO_AUTH || ''
const ARGO_PORT = PORT
const CFIP = process.env.CFIP || 'saas.sin.fan'
const CFPORT = process.env.CFPORT || 443
const NAME = process.env.NAME || ''
const UUID =
	process.env.UUID ||
	(String(ARGO_DOMAIN || '').trim()
		? hashSeedToUuid(`argo-domain:${String(ARGO_DOMAIN).trim().toLowerCase()}`)
		: hashSeedToUuid(`machine:${resolveMachineCode()}`))

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
const nezhaLogPath = path.join(FILE_PATH, 'nezha.log')

module.exports = {
	UPLOAD_URL,
	PROJECT_URL,
	AUTO_ACCESS,
	FILE_PATH,
	SUB_PATH,
	PORT,
	HTTP_PORT,
	HTTP_DOMAIN,
	UUID,
	NEZHA_SERVER,
	NEZHA_KEY,
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
	nezhaConfigPath,
	nezhaLogPath
}

