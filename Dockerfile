FROM node:alpine3.20

WORKDIR /app

# 先装依赖（利用缓存）
COPY package*.json ./
RUN npm install --only=production

# 再拷贝代码
COPY . .

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "index.js"]