FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

RUN npm install

ARG VITE_API_BASE="http://localhost:8000/api"
ENV VITE_API_BASE=${VITE_API_BASE}

RUN npm run build


FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

