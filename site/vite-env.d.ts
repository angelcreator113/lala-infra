/// <reference types="vite/client" />

// (optional) declare your own env keys for autocompletion:
interface ImportMetaEnv {
  readonly VITE_AWS_REGION: string;
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_REDIRECT_URI: string;
  readonly VITE_UPLOADS_API: string;
  readonly VITE_FAN_API: string;
  readonly VITE_API: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
