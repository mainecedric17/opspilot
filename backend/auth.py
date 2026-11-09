
import os
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError, PyJWKClientError


# --------------------------------------------------
# SUPABASE CONFIGURATION
# --------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")

if not SUPABASE_URL:
    raise RuntimeError(
        "SUPABASE_URL is missing from backend/.env"
    )

if not SUPABASE_URL.startswith("https://"):
    raise RuntimeError(
        "SUPABASE_URL must start with https://"
    )


JWT_ISSUER = f"{SUPABASE_URL}/auth/v1"

JWKS_URL = (
    f"{JWT_ISSUER}/.well-known/jwks.json"
)

ALLOWED_ALGORITHMS = [
    "ES256",
    "RS256"
]


# --------------------------------------------------
# BEARER TOKEN SECURITY
# --------------------------------------------------

bearer_scheme = HTTPBearer(
    auto_error=False,
    description=(
        "Enter your Supabase access token. "
        "Do not include the word Bearer."
    )
)


# --------------------------------------------------
# SUPABASE PUBLIC SIGNING KEYS
# --------------------------------------------------

@lru_cache(maxsize=1)
def get_jwks_client() -> PyJWKClient:
    return PyJWKClient(
        JWKS_URL,
        cache_jwk_set=True,
        lifespan=300,
        timeout=5
    )


# --------------------------------------------------
# VERIFY SUPABASE ACCESS TOKEN
# --------------------------------------------------

def verify_access_token(token: str) -> dict:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    try:
        signing_key = (
            get_jwks_client()
            .get_signing_key_from_jwt(token)
        )

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALLOWED_ALGORITHMS,
            audience="authenticated",
            issuer=JWT_ISSUER,
            options={
                "require": [
                    "exp",
                    "iat",
                    "sub",
                    "aud",
                    "iss"
                ]
            }
        )

        user_id = payload.get("sub")

        if not isinstance(user_id, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user identity",
                headers={
                    "WWW-Authenticate": "Bearer"
                }
            )

        if payload.get("role") != "authenticated":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authenticated user role required"
            )

        return payload

    except HTTPException:
        raise

    except PyJWKClientError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signing key",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    except PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )


# --------------------------------------------------
# FASTAPI AUTHENTICATION DEPENDENCY
# --------------------------------------------------

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    )
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication scheme",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    return verify_access_token(
        credentials.credentials
    )
