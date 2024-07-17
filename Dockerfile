# Build stage
FROM node:22-alpine AS build

# Set working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock .yarnrc.yml ./

# Enable Corepack for Yarn 4.x support
RUN corepack enable && corepack prepare yarn@4.3.1 --activate

# Copy the rest of the application code
COPY . .

# Install dependencies
RUN yarn install && yarn build

# Production stage
FROM nginx:alpine

# Copy the built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
