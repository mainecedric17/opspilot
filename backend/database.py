
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load local environment variables.
# Render will provide its own environment variables in production.
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing.")

# Explicitly use Psycopg 3.
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://",
        "postgresql+psycopg://",
        1,
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={"connect_timeout": 10},
)


def test_connection():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT current_database()"))
        return result.scalar()


if __name__ == "__main__":
    try:
        database_name = test_connection()
        print(f"Connected to PostgreSQL database: {database_name}")
    except Exception as error:
        print(f"Database connection failed: {type(error).__name__}")
