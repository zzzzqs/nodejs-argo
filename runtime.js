const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const { promisify } = require('util')
const exec = promisify(require('child_process').exec)

const {
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
	configPath
} = require('./config')

const { startNezhaAgent } = require('./nezha')

// 运行目录
if (!fs.existsSync(FILE_PATH)) {
	fs.mkdirSync(FILE_PATH)
	console.log(`运行目录已创建：${FILE_PATH}`)
} else {
	console.log(`运行目录已存在：${FILE_PATH}`)
}

// 删除订阅器上的历史节点
function deleteNodes() {
	try {
		if (!UPLOAD_URL) return
		if (!fs.existsSync(subPath)) return

		let fileContent
		try {
			fileContent = fs.readFileSync(subPath, 'utf-8')
		} catch {
			return null
		}

		const decoded = Buffer.from(fileContent, 'base64').toString('utf-8')
		const nodes = decoded.split('\n').filter((line) => /(vless|trojan|hysteria2|tuic):\/\//.test(line))

		if (nodes.length === 0) return

		axios.post(`${UPLOAD_URL}/api/delete-nodes`, { nodes }, { headers: { 'Content-Type': 'application/json' } }).catch(() => null)
		return null
	} catch {
		return null
	}
}

// 仅删除已知的临时/产物文件
const TEMP_FILENAMES = new Set(['config.json', 'config.yaml', 'boot.log', 'tunnel.json', 'tunnel.yml'])

function cleanupOldFiles() {
	try {
		const files = fs.readdirSync(FILE_PATH)
		files.forEach((file) => {
			const filePath = path.join(FILE_PATH, file)
			try {
				const stat = fs.statSync(filePath)
				if (stat.isFile() && TEMP_FILENAMES.has(file)) {
					fs.unlinkSync(filePath)
				}
			} catch {
				// 忽略
			}
		})
	} catch {
		// 忽略
	}
}

// 生成 xray 配置
async function generateConfig() {
	const config = {
		log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
		inbounds: [
			{
				port: PORT,
				protocol: 'vless',
				settings: {
					clients: [{ id: UUID, flow: 'xtls-rprx-vision' }],
					decryption: 'none',
					fallbacks: [
						{ path: `/${SUB_PATH}`, dest: Number(HTTP_PORT) },
						{ path: '/vless-argo', dest: 3002 },
						{ path: '/trojan-argo', dest: 3004 },
						{ dest: Number(HTTP_PORT) }
					]
				},
				streamSettings: { network: 'tcp' }
			},
			{
				port: 3002,
				listen: '127.0.0.1',
				protocol: 'vless',
				settings: { clients: [{ id: UUID, level: 0 }], decryption: 'none' },
				streamSettings: { network: 'ws', security: 'none', wsSettings: { path: '/vless-argo' } },
				sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], metadataOnly: false }
			},
			{
				port: 3004,
				listen: '127.0.0.1',
				protocol: 'trojan',
				settings: { clients: [{ password: UUID }] },
				streamSettings: { network: 'ws', security: 'none', wsSettings: { path: '/trojan-argo' } },
				sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], metadataOnly: false }
			}
		],
		dns: { servers: ['https+local://8.8.8.8/dns-query'] },
		outbounds: [
			{ protocol: 'freedom', tag: 'direct' },
			{ protocol: 'blackhole', tag: 'block' }
		]
	}
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

// 系统架构
function getSystemArchitecture() {
	const arch = os.arch()
	if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
		return 'arm'
	}
	return 'amd'
}

// 下载文件
function downloadFile(fileName, fileUrl, callback) {
	const filePath = fileName

	if (!fs.existsSync(FILE_PATH)) {
		fs.mkdirSync(FILE_PATH, { recursive: true })
	}

	const writer = fs.createWriteStream(filePath)

	axios({
		method: 'get',
		url: fileUrl,
		responseType: 'stream'
	})
		.then((response) => {
			response.data.pipe(writer)

			writer.on('finish', () => {
				writer.close()
				console.log(`下载成功：${path.basename(filePath)}`)
				callback(null, filePath)
			})

			writer.on('error', (err) => {
				fs.unlink(filePath, () => {})
				const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`
				console.error(`下载失败：${path.basename(filePath)}，原因：${err.message}`)
				callback(errorMessage)
			})
		})
		.catch((err) => {
			const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`
			console.error(`下载失败：${path.basename(filePath)}，原因：${err.message}`)
			callback(errorMessage)
		})
}

function authorizeFiles(filePaths) {
	const newPermissions = 0o775
	filePaths.forEach((absoluteFilePath) => {
		if (fs.existsSync(absoluteFilePath)) {
			fs.chmod(absoluteFilePath, newPermissions, (err) => {
				if (err) {
						console.error(`授权失败：${absoluteFilePath}，原因：${err}`)
				} else {
						console.log(`授权成功：${absoluteFilePath}（权限：${newPermissions.toString(8)}）`)
				}
			})
		}
	})
}

// 根据系统架构返回下载列表
function getFilesForArchitecture(architecture) {
	let baseFiles
	if (architecture === 'arm') {
		baseFiles = [
			{ fileName: webPath, fileUrl: 'https://arm64.ssss.nyc.mn/web' },
			{ fileName: botPath, fileUrl: 'https://arm64.ssss.nyc.mn/bot' }
		]
	} else {
		baseFiles = [
			{ fileName: webPath, fileUrl: 'https://amd64.ssss.nyc.mn/web' },
			{ fileName: botPath, fileUrl: 'https://amd64.ssss.nyc.mn/bot' }
		]
	}

	return baseFiles
}

// 下载并运行依赖
async function downloadFilesAndRun() {
	const architecture = getSystemArchitecture()
	const filesToDownload = getFilesForArchitecture(architecture)

	if (filesToDownload.length === 0) {
		console.log(`未找到适配当前系统架构的下载文件`)
		return
	}

	const downloadPromises = filesToDownload.map(
		(fileInfo) =>
			new Promise((resolve, reject) => {
				downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
					if (err) {
						reject(err)
					} else {
						resolve(filePath)
					}
				})
			})
	)

	try {
		await Promise.all(downloadPromises)
	} catch (err) {
		console.error('下载依赖文件时发生错误：', err)
		return
	}

	const filesToAuthorize = [webPath, botPath]
	authorizeFiles(filesToAuthorize)

	// xray
	const command1 = `nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`
	try {
		await exec(command1)
		console.log(`${webName} 已启动`)
		await new Promise((resolve) => setTimeout(resolve, 1000))
	} catch (error) {
		console.error(`xray 启动失败：${error}`)
	}

	// cloudflared
	if (fs.existsSync(botPath)) {
		let args

		if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
			args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`
		} else if (ARGO_AUTH.match(/TunnelSecret/)) {
			args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`
		} else {
			args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${PORT}`
		}

		try {
			await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`)
			console.log(`${botName} 已启动`)
			await new Promise((resolve) => setTimeout(resolve, 2000))
		} catch (error) {
			console.error(`执行 cloudflared 命令失败：${error}`)
		}
	}

	await new Promise((resolve) => setTimeout(resolve, 5000))
}

// 固定隧道
function argoType() {
	if (!ARGO_AUTH || !ARGO_DOMAIN) {
		console.log('未设置 ARGO_DOMAIN 或 ARGO_AUTH，将使用临时隧道')
		return
	}

	if (ARGO_AUTH.includes('TunnelSecret')) {
		fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH)
		const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `
		fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml)
	} else {
		console.log('ARGO_AUTH 不是 TunnelSecret 格式，将使用 token 方式连接隧道（或临时隧道）')
	}
}

const EXTRACT_DOMAINS_MAX_RETRIES = 3

async function killBotProcess() {
	try {
		if (process.platform === 'win32') {
			await exec(`taskkill /f /im ${botName}.exe > nul 2>&1`)
		} else {
			await exec(`pkill -f "[${botName.charAt(0)}]${botName.substring(1)}" > /dev/null 2>&1`)
		}
	} catch {}
}

// 提取临时隧道域名
async function extractDomains(retryCount = 0) {
	let argoDomain

	if (ARGO_AUTH && ARGO_DOMAIN) {
		argoDomain = ARGO_DOMAIN
		console.log('ARGO_DOMAIN：', argoDomain)
		await generateLinks(argoDomain)
		return
	}

	try {
		const fileContent = fs.readFileSync(bootLogPath, 'utf-8')
		const lines = fileContent.split('\n')
		const argoDomains = []
		lines.forEach((line) => {
			const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/)
			if (domainMatch) {
				argoDomains.push(domainMatch[1])
			}
		})

		if (argoDomains.length > 0) {
			argoDomain = argoDomains[0]
			console.log('临时隧道域名：', argoDomain)
			await generateLinks(argoDomain)
			return
		}

		if (retryCount >= EXTRACT_DOMAINS_MAX_RETRIES) {
			console.error('多次尝试后仍未获取到临时隧道域名，已放弃')
			return
		}

		console.log('未获取到临时隧道域名，正在重启 cloudflared 以重新获取')
		fs.unlinkSync(bootLogPath)
		await killBotProcess()
		await new Promise((resolve) => setTimeout(resolve, 3000))
		const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${PORT}`
		try {
			await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`)
			console.log(`${botName} 已启动`)
			await new Promise((resolve) => setTimeout(resolve, 3000))
			await extractDomains(retryCount + 1)
		} catch (error) {
			console.error(`执行 cloudflared 命令失败：${error}`)
		}
	} catch (error) {
		console.error('读取 boot.log 失败：', error)
	}
}

// ISP 信息
async function getMetaInfo() {
	try {
		const response1 = await axios.get('https://api.ip.sb/geoip', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 })
		if (response1.data && response1.data.country_code && response1.data.isp) {
			return `${response1.data.country_code}-${response1.data.isp}`.replace(/\s+/g, '_')
		}
	} catch {
		try {
			const response2 = await axios.get('http://ip-api.com/json', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 })
			if (response2.data && response2.data.status === 'success' && response2.data.countryCode && response2.data.org) {
				return `${response2.data.countryCode}-${response2.data.org}`.replace(/\s+/g, '_')
			}
		} catch {}
	}
	return 'Unknown'
}

function buildDirectVlessNode(host, nodeName) {
	const endpoint = parseDirectEndpoint(host, PORT)
	const params = new URLSearchParams({
		encryption: 'none',
		security: endpoint.tls ? 'tls' : 'none',
		type: 'ws',
		host: endpoint.hostname,
		path: '/vless-argo?ed=2560'
	})

	if (endpoint.tls) {
		params.set('sni', endpoint.hostname)
	}

	return `vless://${UUID}@${endpoint.hostname}:${endpoint.port}?${params.toString()}#direct-${nodeName}`
}

function buildTunnelNodes(host, nodeName) {
	return [
		`vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${host}&fp=firefox&type=ws&host=${host}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-argo-vless`,
		`trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${host}&fp=firefox&type=ws&host=${host}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}-argo-trojan`
	]
}

function parseDirectEndpoint(value, defaultPort) {
	const normalized = String(value || '').trim()
	if (!normalized) {
		return { hostname: '', port: defaultPort, tls: false }
	}

	if (!/^[a-z]+:\/\//i.test(normalized)) {
		try {
			const endpoint = new URL(`http://${normalized}`)
			return {
				hostname: endpoint.hostname,
				port: endpoint.port ? Number(endpoint.port) : defaultPort,
				tls: false
			}
		} catch {
			return { hostname: normalized, port: defaultPort, tls: false }
		}
	}

	try {
		const endpoint = new URL(normalized)
		const tls = endpoint.protocol === 'https:'
		return {
			hostname: endpoint.hostname,
			port: endpoint.port ? Number(endpoint.port) : tls ? 443 : 80,
			tls
		}
	} catch {
		return { hostname: normalized, port: defaultPort, tls: false }
	}
}

// 生成 list 和 sub
async function generateLinks(argoDomain) {
	const ISP = await getMetaInfo()
	const nodeName = NAME ? `${NAME}-${ISP}` : ISP
	const nodes = []

	if (HTTP_DOMAIN) {
		nodes.push(buildDirectVlessNode(HTTP_DOMAIN, nodeName))
	}

	if (argoDomain) {
		nodes.push(...buildTunnelNodes(argoDomain, nodeName))
	}

	return new Promise((resolve) => {
		setTimeout(() => {
			const listTxt = nodes.join('\n\n')
			const encodedSub = Buffer.from(listTxt).toString('base64')
			console.log(encodedSub)
			fs.writeFileSync(listPath, listTxt)
			fs.writeFileSync(subPath, encodedSub)
			console.log(`订阅文件已写入：${FILE_PATH}/sub.txt`)
			uploadNodes()
			resolve(listTxt)
		}, 2000)
	})
}

// 上传节点/订阅
async function uploadNodes() {
	if (UPLOAD_URL && PROJECT_URL) {
		const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`
		const jsonData = {
			subscription: [subscriptionUrl]
		}
		try {
			const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
				headers: {
					'Content-Type': 'application/json'
				}
			})

			if (response && response.status === 200) {
				console.log('订阅上传成功')
				return response
			}
			return null
		} catch (error) {
			if (error.response && error.response.status === 400) {
				// 订阅已存在，忽略
			}
		}
	} else if (UPLOAD_URL) {
		if (!fs.existsSync(listPath)) return
		const content = fs.readFileSync(listPath, 'utf-8')
		const nodes = content.split('\n').filter((line) => /(vless|trojan|hysteria2|tuic):\/\//.test(line))

		if (nodes.length === 0) return

		try {
			const response = await axios.post(
				`${UPLOAD_URL}/api/add-nodes`,
				{ nodes },
				{
					headers: { 'Content-Type': 'application/json' }
				}
			)
			if (response && response.status === 200) {
				console.log('节点上传成功')
				return response
			}
			return null
		} catch {
			return null
		}
	} else {
		return
	}
}

// 清理临时文件
function cleanFiles() {
	setTimeout(async () => {
		const filesToDelete = [bootLogPath, configPath, webPath, botPath]
		const cmd =
			process.platform === 'win32' ? `del /f /q ${filesToDelete.join(' ')} > nul 2>&1` : `rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`
		try {
			await exec(cmd)
		} catch {
			// 忽略删除失败
		} finally {
			console.clear()
			console.log('程序正在运行')
			console.log('感谢使用，祝使用愉快！')
		}
	}, 90000)
}

// 自动访问项目 URL
async function addVisitTask() {
	if (!AUTO_ACCESS || !PROJECT_URL) {
		console.log('未开启自动访问任务，已跳过')
		return
	}

	try {
		const response = await axios.post(
			'https://oooo.serv00.net/add-url',
			{
				url: PROJECT_URL
			},
			{
				headers: {
					'Content-Type': 'application/json'
				}
			}
		)
		console.log(`自动访问任务添加成功`)
		return response
	} catch (error) {
		console.error(`自动访问任务添加失败：${error.message}`)
		return null
	}
}

// 主运行逻辑
async function startCore() {
	try {
		argoType()
		deleteNodes()
		cleanupOldFiles()
		await generateConfig()
		await startNezhaAgent()
		await downloadFilesAndRun()
		await extractDomains()
		await addVisitTask()
		cleanFiles()
	} catch (error) {
		console.error('核心流程发生错误：', error)
	}
}

module.exports = {
	startCore,
	subPath
}
