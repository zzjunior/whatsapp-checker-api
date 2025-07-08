FROM node:20-alpine

WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências
RUN npm install --production

# Copia o código fonte
COPY . .

EXPOSE 3000

CMD ["node", "src/start-admin.js"]
