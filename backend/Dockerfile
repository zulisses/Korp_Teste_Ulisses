FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG PROJECT_PATH
WORKDIR /src
COPY . .
RUN dotnet restore Korp.slnx
RUN dotnet tool restore
RUN dotnet publish "$PROJECT_PATH" -c Release -o /app/publish --no-restore

FROM build AS tooling
WORKDIR /workspace

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .
ARG SERVICE_DLL
ENV SERVICE_DLL=${SERVICE_DLL}
ENTRYPOINT ["sh", "-c", "dotnet $SERVICE_DLL"]
