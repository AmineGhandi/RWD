# Stage 1: Build client frontend
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build server backend
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS server-builder
WORKDIR /app
COPY server/Rwd.Server.csproj server/
RUN dotnet restore server/Rwd.Server.csproj
COPY server/ server/
COPY --from=client-builder /app/client/dist server/wwwroot
RUN dotnet publish server/Rwd.Server.csproj -c Release -o /app/publish

# Stage 3: Lightweight runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS final
WORKDIR /app
COPY --from=server-builder /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "Rwd.Server.dll"]
