# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript if needed (optional)
# RUN npm run build

# Expose the port your app runs on
EXPOSE 3001

# Start server
CMD ["npx", "ts-node", "index.ts"]
