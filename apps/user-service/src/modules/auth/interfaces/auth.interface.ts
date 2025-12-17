export interface ITokenResponse {
    accessToken: string;
    refreshToken: string;
}

export interface IAuthPayload {
    id: string;
    role: string;
    tokenType?: TokenType;
}

export enum TokenType {
    ACCESS_TOKEN = 'AccessToken',
    REFRESH_TOKEN = 'RefreshToken',
}

export interface IAppConfig {
    env: string;
    name: string;
    versioning: {
        enable: boolean;
        prefix: string;
        version: string;
    };
    throttle: {
        ttl: number;
        limit: number;
    };
    http: {
        host: string;
        port: number;
    };
    cors: {
        origin: string[] | boolean;
        methods: string[];
        allowedHeaders: string[];
        credentials: boolean;
        exposedHeaders: string[];
    };
    sentry: {
        dsn?: string;
        env: string;
    };
    debug: boolean;
    logLevel: string;
}