"""Creates an operator account: python -m khaleesi.create_user <username>."""

import argparse
import getpass
import sys

from khaleesi.auth import hash_password
from khaleesi.config import Settings
from khaleesi.database import Database, UserExistsError

_MIN_PASSWORD_LENGTH = 8


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Khaleesi operator account.")
    parser.add_argument("username")
    username = parser.parse_args().username

    password = getpass.getpass("Password: ")
    if len(password) < _MIN_PASSWORD_LENGTH:
        print(f"The password needs at least {_MIN_PASSWORD_LENGTH} characters.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Confirm password: "):
        print("The passwords do not match.", file=sys.stderr)
        return 1

    settings = Settings.from_env()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    database = Database(settings.db_path)
    database.initialize()
    try:
        database.create_user(username, hash_password(password))
    except UserExistsError:
        print(f"The user {username!r} already exists.", file=sys.stderr)
        return 1

    print(f"Created user {username!r}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
