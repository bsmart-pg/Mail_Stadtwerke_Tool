# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose Vite port
EXPOSE 5174

# Start Vite dev server
CMD ["npm", "run", "dev"]
