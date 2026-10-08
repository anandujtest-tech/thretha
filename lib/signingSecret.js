const DEVELOPMENT_SECRETS = {
  customer: 'thretha_couture_jwt_secret_2026',
  action: 'thretha_dev_secret',
}

export function getSigningSecret(purpose = 'action') {
  const configured = process.env.JWT_SECRET || process.env.AUTH_SECRET
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Signing is not configured for this server.')
  }
  return DEVELOPMENT_SECRETS[purpose] || DEVELOPMENT_SECRETS.action
}
