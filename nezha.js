const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const unzipper = require('unzipper')
const { promisify } = require('util')
const exec = promisify(require('child_process').exec)

const { FILE_PATH, UUID, NEZHA_SERVER, NEZHA_KEY, NEZHA_TLS, npmPath, nezhaConfigPath } = require('./config')

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

function writeNezhaYamlConfig() {
	const nezhaUuid = process.env.NEZHA_UUID || UUID

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
tls: ${NEZHA_TLS ? 'true' : 'false'}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${nezhaUuid}
`

	fs.writeFileSync(nezhaConfigPath, yml)
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

		writeNezhaYamlConfig()

		const cmd = `nohup ${npmPath} --config ${nezhaConfigPath} >/dev/null 2>&1 &`
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

