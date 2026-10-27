interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL: string;
  readonly PUBLIC_PRIVACY_POLICY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
