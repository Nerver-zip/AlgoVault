# AlgoVault deployment security checklist

This repository is safe to deploy only after every step below is complete.

1. Rotate the GitHub OAuth client secret that was previously committed. Treat the old one as compromised.
2. Keep your existing GitHub OAuth app and regenerate its client secret. Set its authorization callback URL to the exact Chrome redirect URL:
   `https://<your-extension-id>.chromiumapp.org/`.
   The extension uses OAuth `state` and PKCE, so do not remove either query parameter from its authorization flow.
3. Set the same GitHub OAuth client ID in `extension/.env` and the backend environment. The GitHub client secret belongs **only** in the backend environment.
4. Set a randomly generated `JWT_SECRET` of at least 32 bytes, a strong database password, and exact `CORS_ALLOWED_ORIGINS` such as `chrome-extension://<your-extension-id>`.
5. On Render, use private Postgres and private Redis connections. Do not expose Redis or Postgres publicly. The bundled Compose configuration keeps both internal to the Docker network.
6. Set `PLASMO_PUBLIC_BACKEND_URL` to the exact HTTPS API URL, then rebuild and reload the extension. The build automatically adds only that exact backend origin to the extension permissions.
7. In GitHub settings, users should prefer a fine-grained PAT restricted to one private repository with only `Contents: Read and write`. The extension never sends it to AlgoVault's database.

Run the final checks before release:

```bash
cd backend && mvn test
cd ../extension && npm run build
```

Do not commit `.env` files, generated database backups, GitHub tokens, or OAuth secrets.
