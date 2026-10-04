"""Generates an oversized CSV for limit-testing. Not checked in as a static
file (purpose-built to exceed backend/app/limits.py's row/size caps).

Usage:
    python fixtures/oversized_generator.py --rows 2500 > /tmp/oversized_rows.csv
    python fixtures/oversized_generator.py --bytes 2200000 > /tmp/oversized_bytes.csv
"""

import argparse
import sys

HEADER = "first_name,last_name,email,phone,address,postal_code"


def row(i: int) -> str:
    return f"First{i},Last{i},user{i}@example.com,+1 555-555-{i % 10000:04d},{i} Main St,{i % 100000:05d}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=None, help="emit exactly this many data rows")
    parser.add_argument("--bytes", type=int, default=None, help="emit rows until output reaches at least this many bytes")
    args = parser.parse_args()

    out = sys.stdout
    out.write(HEADER + "\n")
    written_bytes = len(HEADER) + 1
    i = 1

    if args.rows is not None:
        for i in range(1, args.rows + 1):
            out.write(row(i) + "\n")
        return

    target = args.bytes if args.bytes is not None else 2_200_000
    while written_bytes < target:
        line = row(i) + "\n"
        out.write(line)
        written_bytes += len(line)
        i += 1


if __name__ == "__main__":
    main()
