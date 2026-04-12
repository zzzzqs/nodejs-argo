const fs = require('fs')
const os = require('os')
const path = require('path')
const tls = require('tls')
const crypto = require('crypto')
const axios = require('axios')
const unzipper = require('unzipper')
const { promisify } = require('util')
const exec = promisify(require('child_process').exec)

const { FILE_PATH, UUID, NEZHA_SERVER, NEZHA_KEY, ARGO_DOMAIN, npmPath, nezhaConfigPath, nezhaLogPath } = require('./config')

function detectPlatform() {
	// Nezha release asset naming uses: linux / darwin / freebsd / windows
	const p = process.platform
	if (p === 'win32') return 'windows'
	if (p === 'darwin') return 'darwin'
	if (p === 'freebsd') return 'freebsd'
	return 'linux'
}

function detectArch() {
	// Nezha release asset naming uses: amd64 / arm64 / arm / 386
	const a = os.arch()
	if (a === 'x64') return 'amd64'
	if (a === 'arm64' || a === 'aarch64') return 'arm64'
	if (a === 'arm') return 'arm'
	if (a === 'ia32') return '386'
	return 'amd64'
}

async function downloadLatestAgentZip(destZipPath) {
	const apiUrl = 'https://api.github.com/repos/nezhahq/agent/releases/latest'
	const release = await axios.get(apiUrl, {
		headers: {
			'User-Agent': 'nodejs-argo',
			Accept: 'application/vnd.github+json'
		},
		timeout: 15000
	})

	const platform = detectPlatform()
	const arch = detectArch()
	const assetName = `nezha-agent_${platform}_${arch}.zip`

	const assets = Array.isArray(release.data?.assets) ? release.data.assets : []
	const asset = assets.find((a) => a?.name === assetName)
	if (!asset?.browser_download_url) {
		throw new Error(`Nezha agent asset not found: ${assetName}`)
	}

	await new Promise((resolve, reject) => {
		axios({
			method: 'get',
			url: asset.browser_download_url,
			responseType: 'stream',
			timeout: 60000
		})
			.then((resp) => {
				const writer = fs.createWriteStream(destZipPath)
				resp.data.pipe(writer)
				writer.on('finish', resolve)
				writer.on('error', reject)
			})
			.catch(reject)
	})

	return { assetName }
}

async function extractZipToDir(zipPath, destDir) {
	await fs.promises.mkdir(destDir, { recursive: true })
	await fs
		.createReadStream(zipPath)
		.pipe(unzipper.Extract({ path: destDir }))
		.promise()
}

function parseNezhaServer(server) {
	const normalized = /^https?:\/\//i.test(server) ? server : `https://${server}`
	const endpoint = new URL(normalized)
	return {
		host: endpoint.hostname,
		port: Number(endpoint.port) || 443
	}
}

async function detectNezhaTls(server) {
	if (!server) return false

	let target
	try {
		target = parseNezhaServer(server)
	} catch {
		return false
	}

	return new Promise((resolve) => {
		let settled = false
		const finish = (result) => {
			if (settled) return
			settled = true
			if (!socket.destroyed) socket.destroy()
			resolve(result)
		}

		const socket = tls.connect(
			{
				host: target.host,
				port: target.port,
				servername: target.host,
				rejectUnauthorized: false
			},
			() => finish(true)
		)

		socket.setTimeout(5000, () => finish(false))
		socket.on('error', () => finish(false))
	})
}

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

function resolveNezhaUuid() {
	if (process.env.NEZHA_UUID) return { uuid: process.env.NEZHA_UUID, source: 'env' }

	const domain = String(ARGO_DOMAIN || '').trim().toLowerCase()
	if (domain) return { uuid: hashSeedToUuid(`argo-domain:${domain}`), source: 'argo-domain' }

	const machineCode = resolveMachineCode()
	return { uuid: hashSeedToUuid(`machine:${machineCode}`), source: 'machine-code' }
}

function writeNezhaYamlConfig(tlsEnabled) {
	const { uuid: nezhaUuid, source } = resolveNezhaUuid()

	// 按你的模板写入，关键字段用环境变量填充
	const yml = `client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: false
disable_command_execute: false
disable_force_update: false
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 1
server: ${NEZHA_SERVER}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${tlsEnabled ? 'true' : 'false'}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${nezhaUuid}
`

	fs.writeFileSync(nezhaConfigPath, yml)
	return { nezhaUuid, source }
}

async function ensureExecutable(p) {
	try {
		await fs.promises.chmod(p, 0o775)
	} catch {
		// 忽略
	}
}

async function startNezhaAgent() {
	if (!NEZHA_SERVER || !NEZHA_KEY) {
		console.log('未配置 NEZHA_SERVER 或 NEZHA_KEY，已跳过哪吒 Agent 启动')
		return
	}

	// 下载 zip → 解压 → 赋权 → 写配置 → 后台启动
	const zipPath = path.join(FILE_PATH, 'nezha-agent.zip')
	const extractDir = path.join(FILE_PATH, 'nezha-agent-extract')

	try {
		const { assetName } = await downloadLatestAgentZip(zipPath)
		console.log(`下载哪吒 Agent 成功：${assetName}`)

		// 解压到临时目录
		await extractZipToDir(zipPath, extractDir)

		// zip 内一般包含 nezha-agent 或 nezha-agent.exe
		const candidateNames = process.platform === 'win32' ? ['nezha-agent.exe'] : ['nezha-agent']
		let found = null
		for (const name of candidateNames) {
			const p = path.join(extractDir, name)
			if (fs.existsSync(p)) {
				found = p
				break
			}
		}
		if (!found) {
			throw new Error('Nezha agent binary not found after unzip')
		}

		// 移动到固定路径（覆盖旧版本）
		await fs.promises.copyFile(found, npmPath)
		await ensureExecutable(npmPath)

		const tlsEnabled = await detectNezhaTls(NEZHA_SERVER)
		const { nezhaUuid, source } = writeNezhaYamlConfig(tlsEnabled)
		fs.appendFileSync(nezhaLogPath, `\n[${new Date().toISOString()}] starting nezha-agent, tls=${tlsEnabled}, uuid=${nezhaUuid}, uuidSource=${source}\n`)
		console.log(`哪吒 TLS 自动判定：${tlsEnabled}`)
		console.log(`哪吒 UUID：${nezhaUuid}（来源：${source}）`)

		const cmd = `nohup "${npmPath}" --config "${nezhaConfigPath}" >> "${nezhaLogPath}" 2>&1 &`
		await exec(cmd)
		console.log(`哪吒 Agent 已启动`, `命令：${cmd}`)
	} finally {
		// 清理 zip 和解压目录（可选）
		try {
			if (fs.existsSync(zipPath)) await fs.promises.unlink(zipPath)
		} catch {}
		try {
			if (fs.existsSync(extractDir)) await fs.promises.rm(extractDir, { recursive: true, force: true })
		} catch {}
	}
}

module.exports = {
	startNezhaAgent
}

