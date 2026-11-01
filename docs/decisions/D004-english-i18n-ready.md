# D004 · English interface, ready for translation through next-intl
Date: 2026-11-01 · Goal: G-001 planning · Status: active (superseded by: —)
Context: The interface could ship in one language or in several.
Decision: The interface is English only, and all its text goes through next-intl messages so languages can be added later.
Force: requirement — the Owner's choice on 2026-11-01.
Rejected: English and Czech from the start.
Consequence: Interface text is never written straight into components. Adding a language means adding a messages file, checked with the i18n-sync skill.
Evidence: GOALS.md G-001 progress log, 2026-11-01.
