const express = require('express')
const fs = require('fs')
const path = require('path')

const { PORT, SUB_PATH } = require('./config')
const { startCore, subPath } = require('./runtime')

const app = express()

// 启动核心逻辑
startCore().catch((error) => {
	console.error('核心模块发生未捕获错误：', error)
})

// 根路由
app.get('/', async (req, res) => {
	try {
		const filePath = path.join(__dirname, 'index.html')
		const data = await fs.promises.readFile(filePath, 'utf8')
		res.send(data)
	} catch {
		res.send(`Hello world!<br><br>You can access /${SUB_PATH} (Default: /sub) to get your nodes!`)
	}
})

// 订阅路由
app.get(`/${SUB_PATH}`, (req, res) => {
	try {
		const content = fs.readFileSync(subPath, 'utf-8')
		res.set('Content-Type', 'text/plain; charset=utf-8')
		res.send(content)
	} catch {
		res.status(404).send('Not ready')
	}
})

app.listen(PORT, () => console.log(`HTTP 服务已启动，监听端口：${PORT}`))
