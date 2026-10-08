# Recovery data

## staff-login-map.csv

The 235 staff records as they stood immediately before the data wipe of
2026-10-08, with the piece that has no other source: **`user_id`**, the link
between an employee and their login account.

The 215 auth accounts survived the wipe, but the link lived on `staff.user_id`,
and the staff rows did not. Without this file those accounts are orphans — no
one can sign in by employee code, because `resolve_login_email()` matches an
employee code against a staff row and reads `user_id` off it.

When staff are re-imported, re-attach the logins by `employee_id`:

```sql
UPDATE staff s SET user_id = m.user_id
  FROM <imported map> m
 WHERE s.employee_id = m.employee_id;
```

214 of the 235 rows carry a `user_id`. The 21 without are the staff created on
2026-09-14 from the August payroll sheet, who never had accounts.

The file also carries `monthly_salary`, `pf`, `esi` and `phone` per employee, so
a re-import does not have to start from the spreadsheet alone.
