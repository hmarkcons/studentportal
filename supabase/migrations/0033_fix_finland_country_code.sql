-- HMARK CRM rebuild — step 29: fix Finland's destination country_code.
-- The "Finland (Public)" destination was created live in the app (not by
-- any migration) using country_code 'FN' — not a real ISO 3166-1 alpha-2
-- code. Finland's actual code is 'FI'. Flagged in 0030's memory notes,
-- now fixed at the user's request.
-- Run after 0032_seed_new_destinations.sql.

update destinations set country_code = 'FI' where country_code = 'FN' and country = 'Finland';
