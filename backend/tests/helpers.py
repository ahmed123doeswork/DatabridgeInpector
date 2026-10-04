from app.scoring import ScorableRow
from app.store import parse_csv_text, row_id_for

DEFAULT_MAPPING = {
    "columns": {
        "first_name": "firstName",
        "last_name": "lastName",
        "email": "email",
        "phone": "phone",
        "address": "addressLine1",
        "postal_code": "postalCode",
    }
}


def fixture_rows_from_csv(csv_content: str) -> list[ScorableRow]:
    header, rows = parse_csv_text(csv_content)
    idx = {
        "firstName": header.index("first_name"),
        "lastName": header.index("last_name"),
        "email": header.index("email"),
        "phone": header.index("phone"),
        "addressLine1": header.index("address"),
        "postalCode": header.index("postal_code"),
    }
    return [
        ScorableRow(
            rowId=row_id_for(i),
            firstName=row[idx["firstName"]],
            lastName=row[idx["lastName"]],
            email=row[idx["email"]],
            phone=row[idx["phone"]],
            addressLine1=row[idx["addressLine1"]],
            postalCode=row[idx["postalCode"]],
        )
        for i, row in enumerate(rows)
    ]
