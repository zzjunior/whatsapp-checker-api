FROM node:22-alpine

WORKDIR /app

# Copia apenas os arquivos de dependências primeiro
COPY package*.json ./

# Instala dependências
RUN npm ci --only=production

# Copia o resto do código
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
